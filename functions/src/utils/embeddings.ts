import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

/**
 * Get OpenAI client (singleton)
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY environment variable");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Generate embeddings for a batch of texts using OpenAI
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const client = getOpenAIClient();
  const embeddings: number[][] = [];

  // OpenAI supports batching up to 2048 inputs
  const batchSize = 100;
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(`Processing embeddings batch ${i / batchSize + 1}/${Math.ceil(texts.length / batchSize)} (${batch.length} texts)`);
    
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });
    
    for (const item of response.data) {
      embeddings.push(item.embedding);
    }
  }

  console.log(`Generated ${embeddings.length} embeddings`);
  return embeddings;
}

/**
 * Generate a single embedding
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddings = await generateEmbeddings([text]);
  return embeddings[0];
}
