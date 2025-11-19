import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

async function checkQdrant() {
    try {
        const result = await qdrantClient.getCollections();
        console.log('Collections:', result.collections.map(c => c.name));

        try {
            const count = await qdrantClient.count('paper_semantics');
            console.log('paper_semantics count:', count.count);
            
            // Peek at one record
            if (count.count > 0) {
                const preview = await qdrantClient.scroll('paper_semantics', {
                    limit: 1,
                    with_payload: true,
                    with_vector: false
                });
                console.log('Sample payload:', JSON.stringify(preview.points[0].payload, null, 2));
            }
        } catch (e) {
            console.log('paper_semantics does not exist');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

checkQdrant();
