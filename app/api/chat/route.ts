import { NextRequest } from 'next/server';
import { openai, MODELS } from '@/lib/ai-client';
import { retrieveChunks } from '@/lib/qdrant-client';
import { db } from '@/lib/firebaseConfig';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc,
  setDoc,
  query,
  orderBy,
  limit as firestoreLimit 
} from 'firebase/firestore';
import { 
  streamText, 
  convertToCoreMessages,
  generateText
} from 'ai';
import type { ChatMessageWithCitations, RetrievedChunk } from '@/lib/types';

const MEMORY_TOKEN_THRESHOLD = 2500;
const MAX_HISTORY_MESSAGES = 10;

export const maxDuration = 30; // Vercel serverless function timeout

export async function POST(request: NextRequest) {
  try {
    const {
      messages,
      userId,
      conversationId,
      summaryLength = 'medium',
      addedPaperIds = [],
    }: {
      messages: ChatMessageWithCitations[];
      userId: string;
      conversationId: string;
      summaryLength?: 'short' | 'medium' | 'long';
      addedPaperIds?: string[];
    } = await request.json();
    
    // Extract the latest user message
    const userMessage = messages[messages.length - 1].parts
      .filter(p => p.type === 'text')
      .map(p => (p as any).text)
      .join('');
    
    // 1. Load or create conversation
    const convRef = doc(db, `users/${userId}/conversations/${conversationId}`);
    let conversation = (await getDoc(convRef)).data();
    
    if (!conversation) {
      await setDoc(convRef, {
        title: userMessage.substring(0, 50) + '...',
        paperIds: addedPaperIds,
        memorySummary: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: { summaryLength },
      });
      conversation = (await getDoc(convRef)).data()!;
    } else if (addedPaperIds.length > 0) {
      const updatedPaperIds = Array.from(
        new Set([...conversation.paperIds, ...addedPaperIds])
      );
      await updateDoc(convRef, {
        paperIds: updatedPaperIds,
        updatedAt: new Date(),
      });
      conversation.paperIds = updatedPaperIds;
    }
    
    // 2. Retrieve recent messages from Firestore
    const messagesRef = collection(db, `users/${userId}/conversations/${conversationId}/messages`);
    const messagesQuery = query(
      messagesRef,
      orderBy('createdAt', 'desc'),
      firestoreLimit(MAX_HISTORY_MESSAGES)
    );
    const messageDocs = await getDocs(messagesQuery);
    const recentMessages = messageDocs.docs
      .map(d => d.data())
      .reverse();
    
    // 3. Retrieve context chunks from Qdrant
    const chunks = await retrieveChunks({
      query: userMessage,
      paperIds: conversation.paperIds.length > 0 ? conversation.paperIds : undefined,
      topK: 12,
    });
    
    const diverseChunks = diversifyChunks(chunks, 10, 3);
    
    // 4. Build context string with [S#] markers
    const contextString = diverseChunks
      .map((chunk, i) => 
        `[S${i+1}] ${chunk.title} (${chunk.paperId}), p.${chunk.pageStart}: "${chunk.textSnippet}"`
      )
      .join('\n\n');
    
    // 5. Build system prompt
    const systemPrompt = buildSystemPrompt(summaryLength);
    let systemMessages = [{ role: 'system' as const, content: systemPrompt }];
    
    if (conversation.memorySummary) {
      systemMessages.push({
        role: 'system' as const,
        content: `Previous conversation summary: ${conversation.memorySummary}`,
      });
    }
    
    // 6. Build message array for LLM
    const llmMessages = [
      ...systemMessages,
      ...convertToCoreMessages(messages.slice(0, -1)), // Previous messages
      {
        role: 'user' as const,
        content: `Context:\n${contextString}\n\nQuestion: ${userMessage}`,
      },
    ];
    
    // 7. Stream the LLM response
    const result = streamText({
      model: openai(MODELS.CHAT),
      messages: llmMessages,
      temperature: 0.3,
      maxOutputTokens: 2000,
      abortSignal: request.signal, // Proper cleanup on disconnect
      onFinish: async ({ text: fullResponse }) => {
        // After streaming completes, save to Firestore
        await addDoc(messagesRef, {
          role: 'user',
          content: userMessage,
          citations: [],
          createdAt: new Date(),
        });
        
        await addDoc(messagesRef, {
          role: 'assistant',
          content: fullResponse,
          citations: parseCitations(fullResponse, diverseChunks),
          createdAt: new Date(),
        });
        
        // Update memory summary if needed
        const totalTokens = estimateTokens(llmMessages) + (fullResponse.length / 4);
        if (totalTokens > MEMORY_TOKEN_THRESHOLD) {
          const newSummary = await generateMemorySummary(recentMessages, fullResponse);
          await updateDoc(convRef, {
            memorySummary: newSummary,
            updatedAt: new Date(),
          });
        }
      },
    });
    
    // 8. Return streaming response
    return result.toTextStreamResponse({
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Citations': JSON.stringify(diverseChunks.map(chunk => ({
          sid: chunk.sid,
          chunkId: chunk.chunkId,
          paperId: chunk.paperId,
          title: chunk.title,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          textSnippet: chunk.textSnippet,
          score: chunk.score,
        }))),
      },
    });
    
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to process chat' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function buildSystemPrompt(summaryLength: 'short' | 'medium' | 'long'): string {
  const lengthInstructions = {
    short: 'Provide concise answers in 2-3 sentences.',
    medium: 'Provide detailed answers in 1 paragraph (5-7 sentences).',
    long: 'Provide comprehensive answers in 3-5 paragraphs with detailed explanations.',
  };
  
  return `You are an AI research assistant helping users understand academic papers.

CITATION RULES:
- When making claims based on the provided context, ALWAYS cite sources using [S#] markers (e.g., [S1], [S2]).
- You can use multiple citations for a single claim: [S1][S3].
- If information is not in the provided sources, explicitly state that you don't have evidence.
- Never fabricate citations.

RESPONSE LENGTH:
${lengthInstructions[summaryLength]}

Be precise, clear, and always ground your responses in the provided context.`;
}

function diversifyChunks(
  chunks: RetrievedChunk[],
  maxTotal: number,
  maxPerPaper: number
): RetrievedChunk[] {
  const paperCounts: Record<string, number> = {};
  const result: RetrievedChunk[] = [];
  
  for (const chunk of chunks) {
    if (result.length >= maxTotal) break;
    
    const count = paperCounts[chunk.paperId] || 0;
    if (count < maxPerPaper) {
      result.push(chunk);
      paperCounts[chunk.paperId] = count + 1;
    }
  }
  
  return result;
}

function parseCitations(
  response: string,
  chunks: RetrievedChunk[]
): Array<{ sid: string; chunkId: string; paperId: string; title: string; pageStart: number; pageEnd: number; textSnippet: string; score: number }> {
  const citationRegex = /\[S(\d+)\]/g;
  const matches = [...response.matchAll(citationRegex)];
  const cited = new Set(matches.map(m => parseInt(m[1])));
  
  return Array.from(cited)
    .filter(num => num > 0 && num <= chunks.length)
    .map(num => chunks[num - 1]);
}

async function generateMemorySummary(
  recentMessages: any[],
  latestResponse: string
): Promise<string> {
  const conversationText = recentMessages
    .slice(0, -5) // Summarize older messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');
  
  const { text } = await generateText({
    model: openai(MODELS.CHAT),
    messages: [
      {
        role: 'system',
        content: 'Summarize the following conversation in 2-3 sentences, preserving key facts and user preferences.',
      },
      {
        role: 'user',
        content: conversationText,
      },
    ],
    temperature: 0.2,
    maxOutputTokens: 150,
  });
  
  return text;
}

function estimateTokens(messages: any[]): number {
  // Rough estimate: ~4 chars per token
  return messages.reduce((sum, m) => sum + (m.content?.length || 0) / 4, 0);
}
