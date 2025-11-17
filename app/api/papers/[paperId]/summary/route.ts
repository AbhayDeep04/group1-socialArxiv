import { NextRequest, NextResponse } from 'next/server';
import { QdrantClient } from '@qdrant/js-client-rest';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { getAdminAuth } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

const collection = 'paper_semantics';
const MAX_CHARS = 80000;
const CHUNK_SIZE = 8000;

async function verifyAuthToken(request: NextRequest): Promise<string | null> {
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

async function fetchAllChunks(paperId: string): Promise<any[]> {
  let points: any[] = [];
  let nextOffset: any = undefined;

  do {
    const response: any = await qdrantClient.scroll(collection, {
      filter: {
        must: [
          { key: 'paperId', match: { value: paperId } },
          { key: 'level', match: { value: 'fulltext' } },
        ],
      },
      with_payload: true,
      limit: 100,
      offset: nextOffset,
    });

    points = points.concat(response.points || []);
    nextOffset = response.next_page_offset;
  } while (nextOffset);

  return points;
}

function promptForChunk(text: string): string {
  return `Summarize the following research paper segment, focusing on: the problem being addressed, the approach taken, key methods used, results achieved, and any limitations mentioned. Be concise and structured.

---
${text}
---

Summary:`;
}

function promptForFinal(summaries: string): string {
  return `You are a research assistant helping to create a comprehensive summary of a research paper. Based on the segment summaries below, produce a well-structured final summary covering:

1. **Abstract/Problem**: What problem does the paper address?
2. **Method**: What approach and techniques are used?
3. **Results**: What are the key findings?
4. **Contributions**: What are the main contributions?
5. **Limitations**: What limitations are mentioned?
6. **Future Work**: What future directions are suggested?
7. **Key Terms**: List important technical terms or concepts

Be faithful to the content, concise, and well-organized.

---
${summaries}
---

Final Summary:`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const userId = await verifyAuthToken(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { paperId } = await params;

    console.log(`Generating summary for paper ${paperId}...`);

    let points = await fetchAllChunks(paperId);

    if (!points.length) {
      return NextResponse.json(
        { error: 'Paper text not available. Please try again later.' },
        { status: 404 }
      );
    }

    points.sort((a, b) => (a.payload?.chunkIndex ?? 0) - (b.payload?.chunkIndex ?? 0));
    const fullText = points.map((p) => p.payload?.chunkText || '').join(' ').trim();

    console.log(`Full text length: ${fullText.length} characters`);

    const models = [
      { name: 'gpt-4o-mini', provider: openai('gpt-4o-mini') },
      { name: 'gemini-2.0-flash-exp', provider: google('gemini-2.0-flash-exp') },
    ];

    async function callLLM(prompt: string): Promise<string> {
      let lastError: any = null;

      for (const { name, provider } of models) {
        try {
          console.log(`Attempting summary generation with model: ${name}`);
          const { text } = await generateText({
            model: provider,
            prompt,
            temperature: 0.1,
            maxRetries: 0,
          });
          console.log(`Successfully generated with ${name}`);
          return text.trim();
        } catch (error: any) {
          console.warn(`Model ${name} failed: ${error.message}`);
          lastError = error;
        }
      }

      throw lastError || new Error('All LLM models failed');
    }

    let summary = '';

    if (fullText.length <= MAX_CHARS) {
      const chunkSummary = await callLLM(promptForChunk(fullText.slice(0, MAX_CHARS)));
      summary = await callLLM(promptForFinal(chunkSummary));
    } else {
      const textChunks: string[] = [];
      for (let i = 0; i < Math.min(fullText.length, MAX_CHARS * 2); i += CHUNK_SIZE) {
        textChunks.push(fullText.slice(i, i + CHUNK_SIZE));
      }

      console.log(`Processing ${textChunks.length} chunks...`);

      const partialSummaries = await Promise.all(
        textChunks.map((chunk) => callLLM(promptForChunk(chunk)))
      );

      summary = await callLLM(promptForFinal(partialSummaries.join('\n\n')));
    }

    console.log(`Summary generated successfully (${summary.length} chars)`);

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error('Error generating summary:', error);
    return NextResponse.json(
      { error: 'Failed to generate summary', message: error.message },
      { status: 500 }
    );
  }
}
