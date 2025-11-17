import { QdrantClient } from "@qdrant/js-client-rest";
import { v5 as uuidv5 } from "uuid";

// Use same namespace as ingestion script for consistency
const QDRANT_UUID_NAMESPACE = "1b671a64-40d5-491e-99b0-da01ff1f3341";

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: {
    paperId: string;
    ownerId: string;
    source: string;
    visibility: string;
    chunkIndex: number;
    page: number;
    text: string;
    title: string;
    authors: string[];
    year: number | null;
    createdAt: string;
  };
}

let qdrantClient: QdrantClient | null = null;

/**
 * Get Qdrant client (singleton)
 */
export function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    const url = process.env.QDRANT_URL;
    const apiKey = process.env.QDRANT_API_KEY;
    
    if (!url || !apiKey) {
      throw new Error("Missing QDRANT_URL or QDRANT_API_KEY environment variables");
    }

    qdrantClient = new QdrantClient({
      url,
      apiKey,
    });
  }
  
  return qdrantClient;
}

/**
 * Generate deterministic UUID for Qdrant point
 */
export function generatePointId(paperId: string, chunkIndex: number): string {
  const idString = `${paperId}:${chunkIndex}`;
  return uuidv5(idString, QDRANT_UUID_NAMESPACE);
}

/**
 * Upsert points to Qdrant collection
 */
export async function upsertPoints(
  collectionName: string,
  points: QdrantPoint[]
): Promise<void> {
  const client = getQdrantClient();
  
  const batchSize = 100;
  
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    console.log(`Upserting batch ${i / batchSize + 1}/${Math.ceil(points.length / batchSize)} to Qdrant`);
    
    await client.upsert(collectionName, {
      wait: true,
      points: batch,
    });
  }
  
  console.log(`Successfully upserted ${points.length} points to ${collectionName}`);
}

/**
 * Delete points for a specific paper
 */
export async function deletePaperPoints(
  collectionName: string,
  paperId: string
): Promise<void> {
  const client = getQdrantClient();
  
  await client.delete(collectionName, {
    wait: true,
    filter: {
      must: [
        {
          key: "paperId",
          match: { value: paperId },
        },
      ],
    },
  });
  
  console.log(`Deleted all points for paper ${paperId} from ${collectionName}`);
}
