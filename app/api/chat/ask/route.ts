import { NextRequest, NextResponse } from 'next/server';
import { QdrantClient } from '@qdrant/js-client-rest';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { getAdminDb, getAdminAuth } from '@/lib/firebaseAdmin';
import { Message, Source } from '@/lib/types';
import OpenAI from 'openai';

// --- Route Segment Config for Vercel ---
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// --- Configuration ---
const qdrantCollectionName = 'paper_semantics';

// --- Initialize Clients ---
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    // --- Step 3: Generate embedding for user query ---
    console.log('Generating embedding for user query...');
    const embeddingResponse = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: message,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;
    console.log(`Generated ${queryEmbedding.length}-dim embedding`);

    // --- Step 4: Vector search in Qdrant using query embedding ---
    console.log(`Searching Qdrant for paper ${paperId} with topK=${topK}...`);
    const hits = await qdrantClient.search(qdrantCollectionName, {
      vector: queryEmbedding,
      limit: topK,
      with_payload: true,
      filter: {
        must: [{ key: 'paperId', match: { value: paperId } }],
      },
    });
    console.log(`Qdrant returned ${hits.length} hits.`);

    // --- Step 5: Build context and sources from top matches ---
    const paperContext = hits
      .map((h: any) => h?.payload?.chunkText || '')
      .filter(Boolean)
      .join('\n\n');

    console.log(`Paper context length: ${paperContext.length} characters`);

    const sources: Source[] = hits.map((h: any, i: number) => ({
      index: i + 1,
      chunkIndex: h?.payload?.chunkIndex ?? 0,
      score: h?.score ?? 0,
      text: (h?.payload?.chunkText || '').slice(0, 500),
    }));

    // --- Step 6: Build conversation history string ---
    const historyString = history
      .slice(-6) // Last 6 messages for context
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    // --- Step 7: Construct LLM prompt ---
    const prompt = `You are a helpful research assistant. Answer the user's question based on the research paper provided below.

${historyString ? `Previous conversation:\n${historyString}\n\n` : ''}Research Paper:
---
${paperContext}
---

User's Question:
${message}

Answer:`;

    console.log('Calling LLM...');

    // --- Step 8: Call LLM with fallback ---
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

    // --- Step 9: Save assistant message to Firestore ---
    const assistantMessageRef = await messagesRef.add({
      role: 'assistant',
      content: finalAiResponseText,
      sources: sources,
      createdAt: new Date(),
    });
    console.log(`Saved assistant message with ID: ${assistantMessageRef.id}`);

    // --- Step 10: Update conversation updatedAt timestamp ---
    await db.collection('conversations').doc(conversationId).update({
      updatedAt: new Date(),
    });

    // --- Step 11: Return response ---
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
