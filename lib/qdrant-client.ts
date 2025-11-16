import { QdrantClient } from '@qdrant/js-client-rest';
import { generateEmbedding } from './ai-client';
import type { RetrievedChunk } from './types';

// Remove port :6333 from URL if present (for Qdrant Cloud compatibility)
const qdrantUrl = process.env.QDRANT_URL?.replace(':6333', '') || 'http://localhost:6333';

export const qdrant = new QdrantClient({
  url: qdrantUrl,
  apiKey: process.env.QDRANT_API_KEY || '',
});

export async function retrieveChunks(params: {
  query: string;
  paperIds?: string[];
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const { query, paperIds, topK = 20 } = params;
  
  const embedding = await generateEmbedding(query);
  
  const filter = paperIds?.length
    ? {
        must: [{
          key: 'paperId',
          match: { any: paperIds }
        }]
      }
    : undefined;
  
  const results = await qdrant.search('paper_chunks', {
    vector: embedding,
    limit: topK,
    filter,
    with_payload: true,
  });
  
  return results.map((r, i) => ({
    sid: `S${i + 1}`,
    chunkId: r.id as string,
    paperId: r.payload!.paperId as string,
    title: r.payload!.title as string,
    pageStart: r.payload!.pageStart as number,
    pageEnd: r.payload!.pageEnd as number,
    textSnippet: r.payload!.text as string,
    score: r.score,
  }));
}
