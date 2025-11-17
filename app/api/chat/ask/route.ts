import { NextRequest, NextResponse } from 'next/server';
import { QdrantClient } from '@qdrant/js-client-rest';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { pipeline } from '@xenova/transformers';
import { getAdminDb, getAdminAuth } from '@/lib/firebaseAdmin';
import { Message, Source } from '@/lib/types';

// --- Route Segment Config for Vercel ---
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// --- Configuration ---
const qdrantCollectionName = 'paper_chunks';
const embeddingModelName = 'Xenova/all-MiniLM-L6-v2';

// --- Initialize Qdrant Client ---
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

// --- Singleton Embedding Model ---
let embedderPromise: any;

async function getEmbedder() {
  if (!embedderPromise) {
    console.log(`Loading embedding model: ${embeddingModelName}...`);
    embedderPromise = pipeline('feature-extraction', embeddingModelName, { quantized: false });
  }
  return embedderPromise;
}

// --- CORS Headers ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// --- OPTIONS Handler for Preflight ---
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders as any });
}

// Helper to verify Firebase auth token
async function verifyAuthToken(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  try {
    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken.uid;
  } catch (error) {
    console.error('Error verifying token:', error);
    return null;
  }
}

// --- POST Handler for /api/chat/ask ---
export async function POST(request: NextRequest) {
  try {
    const userId = await verifyAuthToken(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId, paperId, message, topK = 6 } = await request.json();

    if (!conversationId || !paperId || !message) {
      return NextResponse.json(
        { error: 'Missing conversationId, paperId, or message' },
        { status: 400 }
      );
    }

    // Verify user owns this conversation
    const db = getAdminDb();
    const conversationDoc = await db.collection('conversations').doc(conversationId).get();
    if (!conversationDoc.exists || conversationDoc.data()?.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // --- Step 1: Load conversation history from Firestore ---
    console.log(`Loading conversation history for ${conversationId}...`);
    const messagesRef = db
      .collection('conversations')
      .doc(conversationId)
      .collection('messages');
    const messagesSnapshot = await messagesRef.orderBy('createdAt', 'asc').get();

    const history: Message[] = [];
    messagesSnapshot.forEach((doc) => {
      const data = doc.data();
      history.push({
        id: doc.id,
        role: data.role,
        content: data.content,
        sources: data.sources || [],
        createdAt: data.createdAt.toDate(),
      });
    });

    console.log(`Loaded ${history.length} messages from conversation history.`);

    // --- Step 2: Save user message to Firestore ---
    const userMessageRef = await messagesRef.add({
      role: 'user',
      content: message,
      createdAt: new Date(),
    });
    console.log(`Saved user message with ID: ${userMessageRef.id}`);

    // --- Step 3: Retrieve ALL chunks for the paper (simple approach) ---
    console.log(`Retrieving ALL chunks for paper ${paperId}...`);
    
    let allChunks = [];
    let offset;

    while (true) {
      const scrollResponse = await qdrantClient.scroll(qdrantCollectionName, {
        filter: {
          must: [{ key: 'paperId', match: { value: paperId } }],
        },
        with_payload: true,
        with_vector: false,
        limit: 500,
        offset: offset,
      });

      const { points, next_page_offset } = scrollResponse;
      allChunks.push(...points);
      offset = next_page_offset;

      if (offset === null || points.length === 0) {
        break;
      }
    }

    console.log(`Retrieved ${allChunks.length} chunks from Qdrant.`);

    // --- Step 4: Sort chunks by index and build full paper context ---
    allChunks.sort((a: any, b: any) => (a.payload?.chunkIndex ?? 0) - (b.payload?.chunkIndex ?? 0));
    
    const paperContext = allChunks
      .map((chunk: any) => chunk.payload?.chunkText || '')
      .join('\n');

    console.log(`Paper context length: ${paperContext.length} characters`);

    // Create minimal sources info (just for display)
    const sources: Source[] = [{
      index: 1,
      chunkIndex: 0,
      score: 1.0,
      text: `Full paper (${allChunks.length} chunks)`,
    }];

    // --- Step 5: Build conversation history string ---
    const historyString = history
      .slice(-6) // Last 6 messages for context
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    // --- Step 6: Construct LLM prompt ---
    const prompt = `You are a helpful research assistant. Answer the user's question based on the research paper provided below.

${historyString ? `Previous conversation:\n${historyString}\n\n` : ''}Research Paper:
---
${paperContext}
---

User's Question:
${message}

Answer:`;

    console.log('Calling LLM...');

    // --- Step 7: Call LLM with fallback ---
    let finalAiResponseText = '';
    let success = false;
    let lastError = null;

    const models = [
      { name: 'gpt-4o-mini', provider: openai('gpt-4o-mini') },
      { name: 'gemini-2.0-flash-exp', provider: google('gemini-2.0-flash-exp') },
    ];

    for (const { name, provider } of models) {
      try {
        console.log(`Attempting LLM call with model: ${name}`);

        const { text } = await generateText({
          model: provider,
          prompt: prompt,
          temperature: 0.1,
          maxRetries: 0,
        });

        finalAiResponseText = text.trim() || "I couldn't generate a response.";
        success = true;
        console.log(`Successfully received response from ${name}`);
        console.log(`Response preview: ${finalAiResponseText.substring(0, 200)}...`);
        break;
      } catch (error: any) {
        console.warn(`[FALLBACK] Model ${name} failed: ${error.message}. Trying next model...`);
        lastError = `${name} failed: ${error.message}`;
        continue;
      }
    }

    if (!success) {
      const errorMsg = lastError || 'All LLM models failed to return a valid response.';
      console.error(`Final LLM Failure: ${errorMsg}`);
      return NextResponse.json({ error: `System Error: ${errorMsg}` }, { status: 500 });
    }

    // --- Step 8: Save assistant message to Firestore ---
    const assistantMessageRef = await messagesRef.add({
      role: 'assistant',
      content: finalAiResponseText,
      sources: sources,
      createdAt: new Date(),
    });
    console.log(`Saved assistant message with ID: ${assistantMessageRef.id}`);

    // --- Step 9: Update conversation updatedAt timestamp ---
    await db.collection('conversations').doc(conversationId).update({
      updatedAt: new Date(),
    });

    // --- Step 10: Return response ---
    return NextResponse.json(
      {
        response: finalAiResponseText,
        sources: sources,
      },
      { status: 200, headers: corsHeaders as any }
    );
  } catch (error: any) {
    console.error('Error in chat/ask API route:', error);
    const errorMessage = error.message || 'An unknown error occurred';
    return NextResponse.json(
      { error: 'Internal Server Error', message: errorMessage },
      { status: 500, headers: corsHeaders as any }
    );
  }
}
