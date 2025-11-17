// Backfill abstract-level embeddings for papers that exist in Typesense but not in Qdrant
// This enables the similar papers feature

import dotenv from 'dotenv';
import path from 'path';
import Typesense from 'typesense';
import { QdrantClient } from '@qdrant/js-client-rest';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { v5 as uuidv5 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const typesenseCollectionName = 'papers';
const qdrantCollectionName = 'paper_semantics';
const embeddingModel = 'text-embedding-3-small';

const typesenseClient = new Typesense.Client({
  nodes: [{
    host: process.env.NEXT_PUBLIC_TYPESENSE_HOST,
    port: parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT || '443', 10),
    protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL,
  }],
  apiKey: process.env.TYPESENSE_ADMIN_API_KEY,
  connectionTimeoutSeconds: 10,
});

const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// UUID namespace for generating deterministic UUIDs
const QDRANT_UUID_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';

async function backfillAbstractEmbeddings() {
  console.log('🚀 Backfilling abstract-level embeddings for similar papers feature\n');

  try {
    // Get count of papers in Typesense
    const searchResult = await typesenseClient.collections(typesenseCollectionName).documents().search({
      q: '*',
      query_by: 'title',
      per_page: 0
    });
    const totalPapers = searchResult.found;
    console.log(`Found ${totalPapers} papers in Typesense`);

    // Check how many abstract-level embeddings already exist
    const scrollResult = await qdrantClient.scroll(qdrantCollectionName, {
      limit: 1,
      with_payload: false,
      with_vector: false,
      filter: {
        must: [{ key: 'level', match: { value: 'abstract' } }]
      }
    });
    console.log(`Found ${scrollResult.points.length > 0 ? 'some' : 'no'} existing abstract-level embeddings`);

    let processedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;
    let page = 1;
    const pageSize = 100;
    const embedBatchSize = 100;

    while (processedCount < totalPapers) {
      console.log(`\nFetching page ${page} (papers ${processedCount + 1}-${Math.min(processedCount + pageSize, totalPapers)})...`);
      
      const result = await typesenseClient.collections(typesenseCollectionName).documents().search({
        q: '*',
        query_by: 'title',
        per_page: pageSize,
        page: page
      });

      if (!result.hits || result.hits.length === 0) {
        break;
      }

      // Prepare batch for embedding
      const batch = [];
      for (const hit of result.hits) {
        const doc = hit.document;
        // Generate deterministic UUID for this paper's abstract
        const pointId = uuidv5(`${doc.id}-abstract`, QDRANT_UUID_NAMESPACE);
        
        // Check if this abstract embedding already exists
        try {
          const existing = await qdrantClient.retrieve(qdrantCollectionName, {
            ids: [pointId],
            with_vector: false
          });
          
          if (existing && existing.length > 0) {
            skippedCount++;
            continue;
          }
        } catch (err) {
          // Point doesn't exist, continue to create it
        }

        batch.push({
          paperId: doc.id,
          pointId: pointId,
          title: doc.title || 'Untitled',
          abstract: doc.abstract || '',
          categories: doc.categories || [],
          year: doc.year || 2024,
          textToEmbed: `${doc.title || ''}\n\n${doc.abstract || ''}`
        });
      }

      if (batch.length === 0) {
        console.log(`  All ${result.hits.length} papers in this batch already have embeddings, skipping...`);
        processedCount += result.hits.length;
        page++;
        continue;
      }

      console.log(`  Creating embeddings for ${batch.length} new papers...`);

      // Generate embeddings in batches
      const qdrantBatch = [];
      for (let i = 0; i < batch.length; i += embedBatchSize) {
        const embedChunk = batch.slice(i, i + embedBatchSize);
        const texts = embedChunk.map(item => item.textToEmbed);

        try {
          const response = await openaiClient.embeddings.create({
            model: embeddingModel,
            input: texts,
          });

          for (let j = 0; j < embedChunk.length; j++) {
            const item = embedChunk[j];
            const embedding = response.data[j].embedding;

            qdrantBatch.push({
              id: item.pointId,
              vector: embedding,
              payload: {
                paperId: item.paperId,
                level: 'abstract',
                title: item.title,
                abstract: item.abstract,
                categories: item.categories,
                year: item.year,
              },
            });
          }

          console.log(`    Generated embeddings for batch ${Math.floor(i / embedBatchSize) + 1}/${Math.ceil(batch.length / embedBatchSize)}`);
        } catch (err) {
          console.error(`    Error generating embeddings:`, err.message);
          continue;
        }
      }

      // Upsert to Qdrant
      if (qdrantBatch.length > 0) {
        try {
          await qdrantClient.upsert(qdrantCollectionName, {
            wait: true,
            points: qdrantBatch,
          });
          console.log(`  ✅ Upserted ${qdrantBatch.length} abstract embeddings to Qdrant`);
          createdCount += qdrantBatch.length;
        } catch (err) {
          console.error(`  ❌ Error upserting to Qdrant:`, err.message);
          console.error(`  Error details:`, JSON.stringify(err, null, 2));
          console.error(`  Sample point:`, JSON.stringify(qdrantBatch[0], null, 2));
        }
      }

      processedCount += result.hits.length;
      page++;

      // Progress update
      const progress = ((processedCount / totalPapers) * 100).toFixed(1);
      console.log(`Progress: ${processedCount}/${totalPapers} (${progress}%) | Created: ${createdCount} | Skipped: ${skippedCount}`);
    }

    console.log('\n✅ Backfill complete!');
    console.log(`Total processed: ${processedCount}`);
    console.log(`Created: ${createdCount}`);
    console.log(`Skipped (already existed): ${skippedCount}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

backfillAbstractEmbeddings();
