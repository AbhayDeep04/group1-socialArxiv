import { QdrantClient } from "@qdrant/js-client-rest";
import { v5 as uuidv5 } from "uuid";

const QDRANT_UUID_NAMESPACE = "1b671a64-40d5-491e-99b0-da01ff1f3341";

// Extended payload for Reducto-based ingestion
export interface QdrantPayload {
  paperId: string;
  text: string;
  page_number: number;
  bbox: string; // JSON string of [x, y, w, h] or similar
  section_type: string; // 'text' | 'table' | 'figure'
  image_url?: string;
  source?: string; // 'reducto'
  createdAt: string;
  [key: string]: unknown;
}

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: QdrantPayload;
}

let qdrantClient: QdrantClient | null = null;

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

export function generatePointId(paperId: string, chunkIndex: number | string): string {
  const idString = `${paperId}:${chunkIndex}`;
  return uuidv5(idString, QDRANT_UUID_NAMESPACE);
}

export async function upsertPoints(
  collectionName: string,
  points: QdrantPoint[]
): Promise<void> {
  const client = getQdrantClient();
  const batchSize = 100;
  
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    await client.upsert(collectionName, {
      wait: true,
      points: batch,
    });
  }
}

export async function hasPaper(collectionName: string, paperId: string): Promise<boolean> {
  const client = getQdrantClient();
  // Just check if any point exists for this paper
  const result = await client.scroll(collectionName, {
    filter: {
      must: [
        {
          key: "paperId",
          match: { value: paperId }
        }
      ]
    },
    limit: 1
  });
  
  return result.points.length > 0;
}

export async function deletePaper(collectionName: string, paperId: string): Promise<void> {
  const client = getQdrantClient();
  await client.delete(collectionName, {
    wait: true,
    filter: {
      must: [
        {
          key: "paperId",
          match: { value: paperId }
        }
      ]
    }
  });
}

export async function getPaperStatus(collectionName: string, paperId: string): Promise<'missing' | 'legacy' | 'reducto'> {
  const client = getQdrantClient();
  const result = await client.scroll(collectionName, {
    filter: {
      must: [
        {
          key: "paperId",
          match: { value: paperId }
        }
      ]
    },
    limit: 1,
    with_payload: true
  });
  
  if (result.points.length === 0) {
    return 'missing';
  }
  
  const payload = result.points[0].payload;
  // Check for Reducto specific fields
  if (payload && payload.source === 'reducto' && payload.bbox) {
    return 'reducto';
  }
  
  return 'legacy';
}
