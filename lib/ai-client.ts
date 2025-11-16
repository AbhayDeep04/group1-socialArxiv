import { openai } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';

export const MODELS = {
  CHAT: 'gpt-4o-mini', // Cost-effective for chat
  EMBEDDINGS: 'text-embedding-3-small',
} as const;

// Single embedding generation
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding(MODELS.EMBEDDINGS),
    value: text,
  });
  return embedding;
}

// Batch embedding generation (up to 2048 texts per batch - much faster!)
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: openai.embedding(MODELS.EMBEDDINGS),
    values: texts,
  });
  return embeddings;
}

// Export openai instance for use in chat API routes
export { openai };
