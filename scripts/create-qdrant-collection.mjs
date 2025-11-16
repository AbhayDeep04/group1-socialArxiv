import dotenv from 'dotenv';
import path from 'path';
import { QdrantClient } from '@qdrant/js-client-rest';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Remove port from URL if present (Qdrant cloud doesn't use :6333 in the base URL)
const qdrantUrl = process.env.QDRANT_URL?.replace(':6333', '') || '';

console.log('Connecting to Qdrant at:', qdrantUrl.substring(0, 50) + '...\n');

const qdrantClient = new QdrantClient({
    url: qdrantUrl,
    apiKey: process.env.QDRANT_API_KEY,
});

const qdrantCollectionName = 'paper_chunks';

async function createCollection() {
    console.log('🚀 Creating Qdrant collection for paper chunks...\n');
    
    try {
        // Check if collection exists
        try {
            await qdrantClient.getCollection(qdrantCollectionName);
            console.log(`✅ Collection "${qdrantCollectionName}" already exists!`);
            
            // Get collection info
            const info = await qdrantClient.getCollection(qdrantCollectionName);
            console.log(`📊 Collection info:`, {
                pointsCount: info.points_count,
                vectorSize: info.config?.params?.vectors?.size,
            });
            return;
        } catch (error) {
            if (error.status !== 404) {
                throw error;
            }
            console.log(`Collection "${qdrantCollectionName}" does not exist. Creating...\n`);
        }

        // Create Qdrant collection
        // Using 1536 dimensions for OpenAI text-embedding-3-small
        await qdrantClient.createCollection(qdrantCollectionName, {
            vectors: { 
                size: 1536,  // OpenAI text-embedding-3-small dimension
                distance: 'Cosine' 
            },
        });
        
        // Create payload index for paperId filtering
        await qdrantClient.createPayloadIndex(qdrantCollectionName, {
            field_name: "paperId",
            field_schema: "keyword",
            wait: true,
        });
        
        console.log(`✅ Created Qdrant collection: ${qdrantCollectionName}`);
        console.log(`📐 Vector dimension: 1536 (OpenAI text-embedding-3-small)`);
        console.log(`🔍 Created index on 'paperId' field for filtering\n`);
        
    } catch (error) {
        console.error('❌ Error creating Qdrant collection:', error);
        throw error;
    }
}

createCollection().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
});
