import { NextRequest, NextResponse } from 'next/server';
import { QdrantClient } from '@qdrant/js-client-rest';
import { pipeline } from '@xenova/transformers';

// --- Route Segment Config for Vercel ---
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// --- Configuration ---
const qdrantCollectionName = 'paper_chunks'; 
const embeddingModelName = 'Xenova/all-MiniLM-L6-v2'; 
// Using stable paid model to bypass free tier rate limits
const llmModelNames = [
  'openai/gpt-4o-mini', 
  'google/gemini-2.0-flash', 
  'mistralai/mistral-7b-instruct', 
];


// --- Initialize Qdrant Client ---
const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

// --- Load Embedding Model (Singleton) ---
class EmbeddingPipelineSingleton {
  static task = 'feature-extraction' as const;
  static model = embeddingModelName;
  static instancePromise: Promise<any> | null = null; 

  static async getInstance(progress_callback: Function | null = null) {
    if (!this.instancePromise) {
      console.log('Loading embedding model for chat API...');
      
      this.instancePromise = pipeline(
          this.task, 
          this.model, 
          { ...(progress_callback !== null && { progress_callback }) }
      );
      
      try {
        await this.instancePromise; 
        console.log('Embedding model loaded.');
      } catch (error) {
         console.error("Failed to load embedding model:", error);
         this.instancePromise = null; 
         throw error; 
      }
    }
    return this.instancePromise;
  }
}


// --- Helper Function: Format Chunks into Context String ---
function formatContext(chunks: any[]): string {
    if (!chunks || chunks.length === 0) {
        return "No text data was retrieved for the paper.";
    }
    
    // Sort all chunks by their index to reassemble the document in order
    chunks.sort((a, b) => (a.payload?.chunkIndex ?? Infinity) - (b.payload?.chunkIndex ?? Infinity));
    
    // Concatenate the text of all chunks to pass the entire document text
    return chunks.map(chunk => chunk.payload?.chunkText || '').join('\n');
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

// --- POST Handler for /api/chat/ask ---
export async function POST(request: NextRequest) {
  try {
    const { paperId, message } = await request.json();

    if (!paperId || !message) {
      return NextResponse.json({ message: 'Missing paperId or message' }, { status: 400 });
    }

    // --- RAG Step 1 & 2: Bypass Semantic Search, Retrieve ALL Chunks ---
    console.log(`Retrieving ALL chunks for paper ${paperId} to pass entire document...`);
    
    let allChunks = [];
    let offset;

    while (true) {
        const scrollResponse = await qdrantClient.scroll(qdrantCollectionName, {
            filter: { 
                must: [{ key: 'paperId', match: { value: paperId } }]
            },
            with_payload: true, 
            with_vector: false, // <-- FIXED: Changed from 'with_vectors' to 'with_vector'
            limit: 500, 
            offset: offset 
        });

        // --- FIXED: Direct destructuring of properties ---
        const { points, next_page_offset } = scrollResponse; 

        allChunks.push(...points);
        offset = next_page_offset; // Use next_page_offset for pagination

        if (offset === null || points.length === 0) {
            break; 
        }
    }

    console.log(`Retrieved total of ${allChunks.length} chunks to represent the full paper.`);

    // 3. Construct the Prompt
    const context = formatContext(allChunks);
    const prompt = `You are an expert AI research assistant helping users understand and work with academic papers. You have been provided with the full text of a research paper.

Instructions:
1.  First, carefully analyze the provided paper text to understand the concepts, methods, and findings.
2.  Answer the user's question based on the paper content whenever possible.
3.  If the user asks for implementations, examples, or applications of concepts described in the paper, you may use your knowledge to provide helpful code or explanations that align with what's described in the paper.
4.  Always ground your answers in the paper's content, but feel free to expand with practical examples, implementations, or clarifications that would help the user understand and apply the concepts.
5.  If the user asks about something completely unrelated to the paper or if you genuinely cannot answer based on the paper content or your knowledge of the topic, clearly state that.

Paper Text:
---
${context}
---

User's Question:
${message}

Answer:`;

    console.log(`Prompt constructed. Calling LLM...`);

    let finalAiResponseText = '';
    let success = false;
    let lastError = null;

    // 4. Implement Fallback Loop
    for (const modelName of llmModelNames) {
        console.log(`Attempting LLM call with model: ${modelName}`);

        const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": `http://localhost:3000`, 
                "X-Title": `Social ArXiv Demo`, 
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    { "role": "user", "content": prompt }
                ],
                stream: false, 
                temperature: 0.1, 
            })
        });

        if (openRouterResponse.status === 429) {
            const errorBody = await openRouterResponse.text();
            console.warn(`[FALLBACK] Model ${modelName} hit rate limit (429). Trying next model...`);
            lastError = `Rate limit hit on ${modelName}.`;
            continue;
        }

        if (!openRouterResponse.ok) {
            const errorBody = await openRouterResponse.text();
            console.error(`[FATAL] Model ${modelName} returned status ${openRouterResponse.status}`, errorBody);
            lastError = `Model ${modelName} failed with status ${openRouterResponse.status}.`;
            break; 
        }

        // Success!
        const responseData = await openRouterResponse.json();
        finalAiResponseText = responseData.choices?.[0]?.message?.content?.trim() || "I couldn't find the comprehensive answer in the full document text.";
        
        // Extract token usage from OpenRouter response
        const usage = responseData.usage || null;
        console.log('Token usage from OpenRouter:', usage);
        
        success = true;
        
        // Return response with usage data
        return NextResponse.json({ 
            response: finalAiResponseText,
            usage: usage 
        }, { status: 200, headers: corsHeaders as any });
    }

    if (!success) {
        const errorMsg = finalAiResponseText || lastError || "All LLM models failed to return a valid response.";
        console.error(`Final LLM Failure: ${errorMsg}`);
        return NextResponse.json({ response: `System Error: ${errorMsg}` }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error in chat/ask API route:', error);
    const errorMessage = error.message || 'An unknown error occurred';
    return NextResponse.json({ message: 'Internal Server Error', error: errorMessage }, { status: 500, headers: corsHeaders as any });
  }
}