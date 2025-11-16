import dotenv from 'dotenv';
import path from 'path';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import fs from 'fs/promises';
import { PdfReader } from 'pdfreader';
import { fileURLToPath } from 'url';
import Typesense from 'typesense';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const pdfsFolderPath = path.join(__dirname, '../public/pdfs');
const metadataFilePath = path.join(pdfsFolderPath, 'metadata.json');
const qdrantCollectionName = 'paper_chunks';

// Remove port from URL if present
const qdrantUrl = process.env.QDRANT_URL?.replace(':6333', '') || 'http://localhost:6333';

const qdrantClient = new QdrantClient({
    url: qdrantUrl,
    apiKey: process.env.QDRANT_API_KEY || '',
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
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

// Extract text from PDF
async function extractTextFromPDF(filePath) {
    return new Promise((resolve, reject) => {
        let fullText = '';
        new PdfReader(null).parseFileItems(filePath, (err, item) => {
            if (err) {
                reject(err);
            } else if (!item) {
                resolve(fullText);
            } else if (item.text) {
                fullText += item.text + ' ';
            }
        });
    });
}

// Chunk text by sentences
function chunkText(text, paperId) {
    const pages = text.split('\f');
    const chunks = [];
    
    pages.forEach((pageText, pageIndex) => {
        const sentences = pageText.match(/[^.!?]+[.!?]+/g) || [];
        let currentChunk = '';
        
        for (const sentence of sentences) {
            if ((currentChunk + sentence).length > 400) {
                if (currentChunk.trim()) {
                    chunks.push({
                        text: currentChunk.trim(),
                        page: pageIndex + 1,
                    });
                }
                currentChunk = sentence;
            } else {
                currentChunk += ' ' + sentence;
            }
        }
        
        if (currentChunk.trim()) {
            chunks.push({
                text: currentChunk.trim(),
                page: pageIndex + 1,
            });
        }
    });
    
    return chunks;
}

async function ingestData() {
    console.log('🚀 Starting OpenAI-based ingestion...\n');
    
    // 1. Recreate Qdrant collection with correct dimensions
    console.log('Setting up Qdrant collection...');
    try {
        try {
            await qdrantClient.deleteCollection(qdrantCollectionName);
            console.log(`Deleted existing collection: ${qdrantCollectionName}`);
        } catch (error) {
            if (error.status !== 404) {
                console.warn('Could not delete collection:', error.message);
            }
        }
        
        await qdrantClient.createCollection(qdrantCollectionName, {
            vectors: { size: 1536, distance: 'Cosine' },
        });
        
        await qdrantClient.createPayloadIndex(qdrantCollectionName, {
            field_name: "paperId",
            field_schema: "keyword",
            wait: true,
        });
        
        console.log('✅ Created Qdrant collection with 1536 dimensions\n');
    } catch (error) {
        console.error('Error setting up Qdrant:', error);
        return;
    }
    
    // 2. Load metadata
    console.log(`Loading metadata from: ${metadataFilePath}`);
    let metadataMap = {};
    try {
        const metadataContent = await fs.readFile(metadataFilePath, 'utf-8');
        metadataMap = JSON.parse(metadataContent);
        console.log(`✅ Loaded metadata for ${Object.keys(metadataMap).length} papers\n`);
    } catch (error) {
        console.warn('Warning: Could not load metadata.json\n');
    }
    
    // 3. Process PDFs
    const pdfFiles = (await fs.readdir(pdfsFolderPath))
        .filter(file => path.extname(file).toLowerCase() === '.pdf');
    
    console.log(`📚 Found ${pdfFiles.length} PDF files\n`);
    
    let totalChunks = 0;
    
    for (const pdfFile of pdfFiles) {
        const filePath = path.join(pdfsFolderPath, pdfFile);
        const paperId = path.basename(pdfFile, '.pdf');
        console.log(`\n📄 Processing: ${pdfFile}...`);
        
        // Get metadata
        const paperMetadata = metadataMap[paperId] || {};
        const metadata = {
            id: paperId,
            title: paperMetadata.title || `Title for ${paperId}`,
            abstract: paperMetadata.abstract || `Abstract for ${paperId}`,
            authors: paperMetadata.authors || ['Author A'],
            categories: paperMetadata.categories || ['cs.AI'],
            year: paperMetadata.year || 2024,
            pdfUrl: `/pdfs/${pdfFile}`,
            source: 'upload',
        };
        
        // Extract text
        const text = await extractTextFromPDF(filePath);
        if (!text) {
            console.log('  ⚠️  No text extracted, skipping...');
            continue;
        }
        
        // Chunk text
        const chunks = chunkText(text, paperId);
        console.log(`  ✂️  Created ${chunks.length} chunks`);
        
        if (chunks.length === 0) continue;
        
        // Generate embeddings in batches
        console.log(`  🤖 Generating embeddings...`);
        const batchSize = 100;
        const points = [];
        
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(chunks.length / batchSize);
            
            console.log(`     Batch ${batchNum}/${totalBatches}...`);
            
            const embeddingResponse = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: batch.map(c => c.text),
            });
            
            for (let j = 0; j < batch.length; j++) {
                const chunk = batch[j];
                points.push({
                    id: uuidv4(), // Use UUID for Qdrant Cloud
                    vector: embeddingResponse.data[j].embedding,
                    payload: {
                        paperId,
                        title: metadata.title,
                        authors: metadata.authors,
                        year: metadata.year,
                        pageStart: chunk.page,
                        pageEnd: chunk.page,
                        text: chunk.text,
                    },
                });
            }
        }
        
        // Upload to Qdrant
        console.log(`  ☁️  Uploading ${points.length} chunks to Qdrant...`);
        await qdrantClient.upsert(qdrantCollectionName, {
            wait: true,
            points,
        });
        
        totalChunks += points.length;
        console.log(`  ✅ Done! Total chunks so far: ${totalChunks}`);
    }
    
    console.log(`\n🎉 Ingestion complete! ${totalChunks} total chunks indexed.\n`);
}

ingestData().catch(error => {
    console.error('❌ Ingestion failed:', error);
    process.exit(1);
});
