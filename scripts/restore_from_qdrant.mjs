import { QdrantClient } from '@qdrant/js-client-rest';
import Typesense from 'typesense';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// --- Init Clients ---
const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

const typesenseClient = new Typesense.Client({
    nodes: [{
        host: process.env.NEXT_PUBLIC_TYPESENSE_HOST,
        port: parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT || '443', 10),
        protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL,
    }],
    apiKey: process.env.TYPESENSE_ADMIN_API_KEY,
    connectionTimeoutSeconds: 10,
});

if (getApps().length === 0) {
    const serviceAccount = {
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'social-arxiv-demo-63c41',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
    initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

const QDRANT_COLLECTION = 'paper_semantics';
const TYPESENSE_COLLECTION = 'papers';

async function restore() {
    console.log('🚀 Starting restoration from Qdrant...');

    // 1. Count
    const count = await qdrantClient.count(QDRANT_COLLECTION);
    const total = count.count;
    console.log(`Found ${total} papers in Qdrant.`);

    // 2. Scroll and Restore
    let offset = null;
    let processed = 0;
    const BATCH_SIZE = 200; // Qdrant scroll limit

    while (processed < total) {
        const scroll = await qdrantClient.scroll(QDRANT_COLLECTION, {
            limit: BATCH_SIZE,
            offset: offset,
            with_payload: true,
            with_vector: false
        });

        // Debug:
        if (processed === 0) {
             console.log('\nFirst scroll response keys:', Object.keys(scroll));
        }

        const points = scroll.points;
        if (!points || points.length === 0) break;

        // Prepare batches
        const typesenseDocs = [];
        const firestoreBatch = db.batch();
        let firestoreOpsCount = 0;

        for (const point of points) {
            const p = point.payload;
            if (!p.paperId) continue;

            // Construct Metadata
            const originalId = p.paperId;
            const safeId = originalId.replace(/\//g, '_'); // Replace slashes with underscores
            const year = typeof p.year === 'number' ? p.year : 2024;
            
            const docData = {
                id: safeId,
                title: p.title || 'Untitled',
                abstract: p.abstract || '',
                authors: [], // Missing in Qdrant :(
                categories: Array.isArray(p.categories) ? p.categories : [],
                year: year,
                pdfUrl: `https://arxiv.org/pdf/${originalId}.pdf`,
                source: 'arxiv',
                arxivId: originalId,
                published: `${year}-01-01`, // Approx
            };

            // Typesense Doc
            typesenseDocs.push(docData);

            // Firestore Doc
            const firestoreRef = db.collection('papers').doc(safeId);
            const firestoreData = {
                ...docData,
                ownerId: 'system',
                visibility: 'public',
                status: 'ready',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                pageCount: null,
                chunkCount: null,
            };
            firestoreBatch.set(firestoreRef, firestoreData, { merge: true });
            firestoreOpsCount++;
        }

        // Execute Batches
        // A. Typesense
        if (typesenseDocs.length > 0) {
            try {
                await typesenseClient.collections(TYPESENSE_COLLECTION).documents().import(typesenseDocs, { action: 'upsert' });
            } catch (e) {
                console.error('Typesense import error:', e.message);
            }
        }

        // B. Firestore
        if (firestoreOpsCount > 0) {
            await firestoreBatch.commit();
        }

        // Update loop
        processed += points.length;
        // Try top-level first, then result
        offset = scroll.next_page_offset || scroll.result?.next_page_offset;
        
        process.stdout.write(`\rRestored ${processed}/${total} papers...`);

        if (!offset) {
            console.log('\nNo next_page_offset found. Stopping.');
            break;
        }
    }

    console.log('\n✅ Restoration complete!');
}

restore().catch(console.error);
