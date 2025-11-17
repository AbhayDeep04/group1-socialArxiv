// Add Qdrant payload indices for year and categories fields
// Run this once to optimize filtering performance on the paper_semantics collection

import dotenv from 'dotenv';
import path from 'path';
import { QdrantClient } from '@qdrant/js-client-rest';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const qdrantCollectionName = 'paper_semantics';

const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

async function addIndices() {
  console.log('🚀 Adding Qdrant payload indices for optimized filtering...\n');

  try {
    // Check if collection exists
    try {
      await qdrantClient.getCollection(qdrantCollectionName);
      console.log(`✅ Found collection: ${qdrantCollectionName}`);
    } catch (error) {
      console.error(`❌ Collection "${qdrantCollectionName}" not found. Please run harvest_cs_metadata.mjs first.`);
      process.exit(1);
    }

    // Add year index (integer)
    console.log('Adding index for "year" field (integer)...');
    try {
      await qdrantClient.createPayloadIndex(qdrantCollectionName, {
        field_name: 'year',
        field_schema: 'integer',
        wait: true,
      });
      console.log('✅ Created index for "year" field');
    } catch (error) {
      console.warn(`⚠️  Index for "year" may already exist or failed: ${error.message}`);
    }

    // Add categories index (keyword)
    console.log('Adding index for "categories" field (keyword)...');
    try {
      await qdrantClient.createPayloadIndex(qdrantCollectionName, {
        field_name: 'categories',
        field_schema: 'keyword',
        wait: true,
      });
      console.log('✅ Created index for "categories" field');
    } catch (error) {
      console.warn(`⚠️  Index for "categories" may already exist or failed: ${error.message}`);
    }

    console.log('\n✅ All indices added successfully!');
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

addIndices();
