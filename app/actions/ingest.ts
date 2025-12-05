'use server';

import { getReductoClient } from '@/lib/reducto-server';
import { fileFromPath } from 'reductoai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateEmbeddings } from '@/lib/embeddings-server';
import { getAdminDb, getAdminStorage } from '@/lib/firebaseAdmin';
import { 
  getQdrantClient, 
  upsertPoints, 
  generatePointId, 
  hasPaper, 
  getPaperStatus,
  deletePaper,
  QdrantPoint,
  QdrantPayload
} from '@/lib/qdrant-server';

const COLLECTION_NAME = 'paper_semantics';

export interface IngestResult {
  success: boolean;
  status: 'ready' | 'ingesting' | 'error';
  message?: string;
  chunksCount?: number;
}

export async function ingestPaper(paperId: string): Promise<IngestResult> {
  let tempFilePath: string | null = null;

  try {
    console.log(`[Ingest] Starting ingestion check for ${paperId}`);
    
    // 1. Check if already indexed and if it's legacy or reducto
    const status = await getPaperStatus(COLLECTION_NAME, paperId);
    
    if (status === 'reducto') {
      console.log(`[Ingest] Paper ${paperId} already exists in Qdrant (Reducto format)`);
      return { success: true, status: 'ready' };
    }

    if (status === 'legacy') {
      console.log(`[Ingest] Paper ${paperId} exists but in legacy format. Deleting and re-ingesting...`);
      await deletePaper(COLLECTION_NAME, paperId);
    } else {
      console.log(`[Ingest] Paper ${paperId} not found. Triggering Reducto...`);
    }

    // 2. Call Reducto
    const reducto = getReductoClient();
    let input: string | any = '';

    // Check Firestore for User Upload
    let storagePath: string | undefined;
    try {
      const db = getAdminDb();
      const docSnap = await db.collection('papers').doc(paperId).get();
      if (docSnap.exists) {
        storagePath = docSnap.data()?.storagePath;
      }
    } catch (err) {
      console.warn('[Ingest] Error checking Firestore:', err);
    }

    // Check for local legacy file
    const localPath = path.join(process.cwd(), 'public', 'pdfs', `${paperId}.pdf`);

    if (storagePath) {
      console.log(`[Ingest] Found uploaded file in storage: ${storagePath}`);
      
      // Download from Firebase Storage to temp file
      const storage = getAdminStorage();
      const bucket = storage.bucket();
      const file = bucket.file(storagePath);
      
      // Create temp file path
      tempFilePath = path.join(os.tmpdir(), `${paperId}-${Date.now()}.pdf`);
      
      await file.download({ destination: tempFilePath });
      console.log(`[Ingest] Downloaded to temp file: ${tempFilePath}`);
      
      const fileObj = await fileFromPath(tempFilePath);
      const upload = await reducto.upload({
        extension: 'pdf',
        file: fileObj
      });
      
      input = `reducto://${upload.file_id}`;
      console.log(`[Ingest] Uploaded storage file to Reducto. ID: ${input}`);

    } else if (fs.existsSync(localPath)) {
      console.log(`[Ingest] Found local file for ${paperId}, uploading to Reducto...`);
      const file = await fileFromPath(localPath);
      const upload = await reducto.upload({
        extension: 'pdf',
        file: file
      });
      // Use the file_id as input (reducto://file_id is implied or we pass the object? 
      // SDK types say "input: string | Shared.Upload")
      // Let's pass the upload object if possible, or the file_id string if that's what it expects
      // Docs say: "3. A reducto:// prefixed URL obtained from the /upload endpoint"
      // But typed params allow `Shared.Upload`.
      // Let's try `reducto://${upload.file_id}` to be safe/explicit.
      input = `reducto://${upload.file_id}`;
      console.log(`[Ingest] Uploaded local file. ID: ${input}`);
    } else {
      // Construct Arxiv PDF URL
      const cleanId = paperId.replace(/^arxiv:/i, '');
      input = `https://arxiv.org/pdf/${cleanId}.pdf`;
      console.log(`[Ingest] Using URL: ${input}`);
    }

    // Reducto parsing
    console.log(`[Ingest] Calling reducto.parse.run...`);
    try {
      const response = await reducto.parse.run({
        input: input,
        retrieval: {
          chunking: {
            chunk_mode: 'variable',
            chunk_size: 1000, // Target ~1000 chars per chunk
          },
          embedding_optimized: true
        },
        enhance: {
          summarize_figures: true,
          agentic: [
            { scope: 'table', prompt: 'Extract numerical data and structure as markdown' },
            { scope: 'figure', prompt: 'Describe this figure in detail for a blind user' }
          ]
        },
        formatting: {
          table_output_format: 'md'
        }
      });

      console.log('[Ingest] Reducto response received.');

      if (!('result' in response)) {
        // This is an async response, it has job_id
        console.log('[Ingest] Async response received:', JSON.stringify(response));
        throw new Error('Reducto returned an async response (job_id) instead of full result. Sync mode expected.');
      }

      console.log('[Ingest] Response Type:', response.result.type);

      if (response.result.type === 'url') {
        console.log('[Ingest] Reducto returned URL result:', response.result.url);
        // Fetch the full JSON from the URL
        const jsonResponse = await fetch(response.result.url);
        if (!jsonResponse.ok) {
          throw new Error(`Failed to fetch Reducto result from URL: ${jsonResponse.statusText}`);
        }
        const fullResult = await jsonResponse.json();
        // Overwrite response.result with the fetched full result
        // We need to cast or carefully construct it
        // Assuming fullResult structure matches FullResult
        // @ts-ignore
        response.result = { ...fullResult, type: 'full' };
      } else if (response.result.type !== 'full') {
        // @ts-ignore - TS gets confused by the checks
        throw new Error(`Reducto response type is ${response.result.type}, expected 'full' or 'url'`);
      }

      if (!('chunks' in response.result) || !response.result.chunks) {
        throw new Error('Reducto response did not contain chunks');
      }

      const chunks = response.result.chunks;
      console.log(`[Ingest] Reducto returned ${chunks.length} chunks`);

      // 3. Generate Embeddings
      // Extract text to embed
      const textsToEmbed = chunks.map(c => c.content);
      const vectors = await generateEmbeddings(textsToEmbed);

      if (vectors.length !== chunks.length) {
        throw new Error('Mismatch between chunks and embeddings count');
      }

      // 4. Prepare Qdrant Points
      const points: QdrantPoint[] = chunks.map((chunk, index) => {
        // Find the first block to get page number and bbox
        // Reducto chunks have 'blocks' which are the original segments
        const firstBlock = chunk.blocks?.[0];
        const pageNumber = firstBlock?.bbox?.page ?? 1; 
        
        // bbox: Reducto block.bbox is usually [x, y, w, h] or similar.
        // We'll stringify it for storage.
        const bbox = firstBlock?.bbox ? JSON.stringify(firstBlock.bbox) : '';
        
        // section_type: 'text' | 'table' | 'figure'
        const section_type = firstBlock?.type?.toLowerCase() || 'text';

        const payload: QdrantPayload = {
          paperId: paperId,
          text: chunk.content,
          page_number: pageNumber,
          bbox: bbox,
          section_type: section_type,
          source: 'reducto',
          createdAt: new Date().toISOString()
        };

        return {
          id: generatePointId(paperId, index),
          vector: vectors[index],
          payload
        };
      });

      // 5. Upsert to Qdrant
      await upsertPoints(COLLECTION_NAME, points);

      console.log(`[Ingest] Successfully indexed ${points.length} chunks for ${paperId}`);

      return { 
        success: true, 
        status: 'ready',
        chunksCount: points.length
      };

    } catch (reductoError: any) {
      console.error('[Ingest] Reducto API Error Details:', JSON.stringify(reductoError, null, 2));
      throw reductoError;
    }

  } catch (error: any) {
    console.error('[Ingest] Error:', error);
    
    return { 
      success: false, 
      status: 'error', 
      message: error.message 
    };
  } finally {
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log(`[Ingest] Cleaned up temp file: ${tempFilePath}`);
      } catch (err) {
        console.warn(`[Ingest] Failed to clean up temp file: ${tempFilePath}`, err);
      }
    }
  }
}
