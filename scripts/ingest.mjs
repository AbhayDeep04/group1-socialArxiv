// Use ES Module import syntax
import dotenv from 'dotenv';
import path from 'path';
import Typesense from 'typesense';
import { QdrantClient } from '@qdrant/js-client-rest';
import fs from 'fs/promises';
import { PdfReader } from 'pdfreader';
import { fileURLToPath } from 'url';
import { v5 as uuidv5 } from 'uuid';
import OpenAI from 'openai';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// --- Configuration ---
// Get __dirname equivalent in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
console.log('DEBUG: Typesense Admin Key Loaded:', process.env.TYPESENSE_ADMIN_API_KEY); // Keep debug line

const pdfsFolderPath = path.join(__dirname, '../public/pdfs');
const metadataFilePath = path.join(pdfsFolderPath, 'metadata.json');
const typesenseCollectionName = 'papers';
const qdrantCollectionName = 'paper_chunks';
const embeddingModel = 'text-embedding-3-small';
const chunkSize = 500;
const chunkOverlap = 50;

// --- Initialize Firebase Admin ---
if (getApps().length === 0) {
    const serviceAccount = {
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'social-arxiv-demo-63c41',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };

    if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
      console.error('Error: FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY is missing in .env.local');
      process.exit(1);
    }

    initializeApp({
      credential: cert(serviceAccount)
    });
}
const db = getFirestore();

// --- Initialize Clients ---
const typesenseClient = new Typesense.Client({
    nodes: [{
        host: process.env.NEXT_PUBLIC_TYPESENSE_HOST,
        port: parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT || '443', 10),
        protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL,
    }],
    apiKey: process.env.TYPESENSE_ADMIN_API_KEY, // Use Admin key for creation/writing
    connectionTimeoutSeconds: 10,
});

const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- Helper Functions ---

// Function to extract text from a PDF file using pdfreader
async function extractTextFromPDF(filePath) {
    return new Promise((resolve, reject) => {
        let fullText = '';
        new PdfReader(null).parseFileItems(filePath, (err, item) => {
            if (err) {
                console.error(`Error reading PDF ${filePath}:`, err);
                reject(err); // Reject the promise on error
            } else if (!item) {
                // End of file
                // console.log(`Extracted text from ${path.basename(filePath)}`);
                resolve(fullText); // Resolve the promise with the full text
            } else if (item.text) {
                // Append text item
                fullText += item.text + ' '; // Add space between items
            }
        });
    });
}


// Function to split text into overlapping chunks
function chunkText(text, size, overlap) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = start + size;
        chunks.push(text.slice(start, end));
        start += size - overlap;
         // Prevent negative start index or infinite loop on zero/negative overlap+size
         if (size - overlap <= 0) {
              if (start === 0 && text.length > 0) break; // Avoid infinite loop if step size is non-positive but text exists
              start = end; // Ensure progression even if overlap >= size
         }
    }
    // Filter out empty or whitespace-only chunks
    return chunks.filter(chunk => chunk && chunk.trim().length > 0);
}

// Define a constant namespace UUID for generating point IDs
const QDRANT_UUID_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341'; // Just a fixed, random UUID

// --- Main Ingestion Logic ---
async function ingestData() {
    console.log('Starting ingestion process...');

    // 1. Setup Typesense Collection
    console.log('Setting up Typesense collection...');
    try {
        // Delete collection if it exists
        try {
            await typesenseClient.collections(typesenseCollectionName).delete();
            console.log(`Deleted existing Typesense collection: ${typesenseCollectionName}`);
        } catch (error) {
             if (error.httpStatus !== 404) {
                  console.warn(`Could not delete existing Typesense collection (may not exist):`, error.message);
             }
        }

        // Define Typesense schema
        const typesenseSchema = {
            name: typesenseCollectionName,
            fields: [
                { name: 'title', type: 'string' },
                { name: 'abstract', type: 'string' },
                { name: 'authors', type: 'string[]', facet: true },
                { name: 'categories', type: 'string[]', facet: true },
                { name: 'year', type: 'int32', facet: true },
                { name: 'pdfUrl', type: 'string' },
                { name: 'source', type: 'string', facet: true },
            ],
            default_sorting_field: 'year',
        };
        await typesenseClient.collections().create(typesenseSchema);
        console.log(`Created Typesense collection: ${typesenseCollectionName}`);
    } catch (error) {
        console.error('Error setting up Typesense:', error);
        return;
    }

    // 2. Setup Qdrant Collection
    console.log('Setting up Qdrant collection...');
    try {
        // Check if collection exists first and delete if it does
         try {
             await qdrantClient.getCollection(qdrantCollectionName);
             console.log(`Qdrant collection "${qdrantCollectionName}" already exists. Deleting...`);
             await qdrantClient.deleteCollection(qdrantCollectionName);
             console.log(`Deleted existing Qdrant collection: ${qdrantCollectionName}`);
         } catch (error) {
             if (error.status !== 404) {
                 console.error('Error checking/deleting existing Qdrant collection:', error);
                 throw error;
             } else {
                 console.log(`Qdrant collection "${qdrantCollectionName}" does not exist. Creating...`);
             }
         }

        // Create Qdrant collection (text-embedding-3-small is 1536-dim)
        await qdrantClient.createCollection(qdrantCollectionName, {
            vectors: { size: 1536, distance: 'Cosine' },
        });
         // Create payload index for paperId filtering
        await qdrantClient.createPayloadIndex(qdrantCollectionName, {
            field_name: "paperId",
            field_schema: "keyword",
            wait: true,
        });
        console.log(`Created Qdrant collection: ${qdrantCollectionName}`);
    } catch (error) {
        console.error('Error setting up Qdrant collection:', error);
        return;
    }

    // 3. Verify OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
        console.error('Error: OPENAI_API_KEY is not set in .env.local');
        return;
    }
    console.log(`Using OpenAI embedding model: ${embeddingModel}`);

    // 4. Load metadata from JSON file
    console.log(`Loading metadata from: ${metadataFilePath}`);
    let metadataMap = {};
    try {
        const metadataContent = await fs.readFile(metadataFilePath, 'utf-8');
        metadataMap = JSON.parse(metadataContent);
        console.log(`Loaded metadata for ${Object.keys(metadataMap).length} papers.`);
    } catch (error) {
        console.warn('Warning: Could not load metadata.json. Using placeholder data.', error.message);
    }

    // 5. Process PDFs
    console.log(`Reading PDFs from: ${pdfsFolderPath}`);
    let pdfFiles;
    try {
        pdfFiles = await fs.readdir(pdfsFolderPath);
        pdfFiles = pdfFiles.filter(file => path.extname(file).toLowerCase() === '.pdf');
    } catch (error) {
        console.error('Error reading PDF directory:', error);
        return;
    }

    if (pdfFiles.length === 0) {
        console.error(`No PDF files found in ${pdfsFolderPath}. Please add some PDFs.`);
        return;
    }
    console.log(`Found ${pdfFiles.length} PDF files.`);

    // --- Batching for Qdrant ---
    let qdrantPointsBatch = [];
    const qdrantBatchSize = 100;

    for (const pdfFile of pdfFiles) {
        const filePath = path.join(pdfsFolderPath, pdfFile);
        const paperId = path.basename(pdfFile, '.pdf');
        console.log(`\nProcessing: ${pdfFile}...`);

        // --- Get Metadata from JSON or use placeholders ---
        const paperMetadata = metadataMap[paperId] || {};
        const metadata = {
            id: paperId,
            title: paperMetadata.title || `Title for ${paperId}`,
            abstract: paperMetadata.abstract || `Abstract for ${paperId}...`,
            authors: paperMetadata.authors || ['Author A', 'Author B'],
            categories: paperMetadata.categories || ['cs.AI', 'cs.LG'],
            year: paperMetadata.year || 2024,
            pdfUrl: `/pdfs/${pdfFile}`, // URL relative to public
            source: 'upload',
        };

        // 4a. Add metadata to Typesense
        try {
            await typesenseClient.collections(typesenseCollectionName).documents().upsert(metadata);
            console.log(` -> Upserted metadata to Typesense for ${paperId}`);
        } catch (error) {
            console.error(` -> Error upserting metadata to Typesense for ${paperId}:`, error);
            continue;
        }

        // 4a.2 Add metadata to Firestore
        try {
            const firestoreData = {
                id: metadata.id,
                source: metadata.source,
                ownerId: "system",
                visibility: "public",
                title: metadata.title,
                authors: metadata.authors,
                abstract: metadata.abstract,
                year: metadata.year,
                venue: "ArXiv", // Default or from metadata
                tags: metadata.categories,
                status: "ready",
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                url: metadata.pdfUrl,
                pageCount: null,
                chunkCount: null, // Will be updated later?
            };
            
            await db.collection('papers').doc(paperId).set(firestoreData, { merge: true });
            console.log(` -> Upserted metadata to Firestore for ${paperId}`);
        } catch (error) {
            console.error(` -> Error upserting metadata to Firestore for ${paperId}:`, error);
            // We continue even if Firestore fails, but logging it is important
        }

        // 4b. Extract text, chunk, embed, prepare for Qdrant
        const text = await extractTextFromPDF(filePath);
        if (!text) {
            console.log(` -> Skipping Qdrant ingestion for ${pdfFile} due to text extraction error.`);
            continue;
        }

        const chunks = chunkText(text, chunkSize, chunkOverlap);
        if (chunks.length === 0) {
            console.log(` -> No text chunks generated for ${pdfFile}. Skipping Qdrant ingestion.`);
            continue;
        }
         console.log(` -> Extracted text, created ${chunks.length} chunks.`);

        // Generate embeddings with OpenAI
         console.log(` -> Generating embeddings for ${chunks.length} chunks...`);
        let chunkEmbeddings = [];
        try {
             const embeddingBatchSize = 100; // OpenAI allows up to 2048 inputs per request
             for (let i = 0; i < chunks.length; i += embeddingBatchSize) {
                 const batchChunks = chunks.slice(i, i + embeddingBatchSize);
                 const response = await openaiClient.embeddings.create({
                     model: embeddingModel,
                     input: batchChunks,
                 });
                 chunkEmbeddings.push(...response.data.map(d => d.embedding));
                 console.log(`    -> Embedded chunk batch ${Math.floor(i / embeddingBatchSize) + 1}/${Math.ceil(chunks.length / embeddingBatchSize)}`);
             }
        } catch (error) {
             console.error(` -> Error generating embeddings for ${paperId}:`, error);
             continue;
        }
        console.log(` -> Embeddings generated.`);

        // Prepare Qdrant points
        for (let i = 0; i < chunks.length; i++) {
            // Generate a deterministic UUID v5 based on paperId and chunk index
            const chunkId = uuidv5(`${paperId}_${i}`, QDRANT_UUID_NAMESPACE);
            qdrantPointsBatch.push({
                id: chunkId,
                vector: chunkEmbeddings[i],
                payload: {
                    paperId: paperId,
                    chunkText: chunks[i],
                    chunkIndex: i,
                },
            });

            // Send batch if full
            if (qdrantPointsBatch.length >= qdrantBatchSize) {
                console.log(` -> Sending batch of ${qdrantPointsBatch.length} points to Qdrant...`);
                try {
                    // *** CORRECTED QDRANT CALL ***
                    await qdrantClient.upsert(qdrantCollectionName, {
                        wait: true,
                        points: qdrantPointsBatch,
                    });
                    qdrantPointsBatch = [];
                } catch (error) {
                    console.error(` -> Error sending batch to Qdrant:`, error);
                }
            }
        }
    } // End PDF loop

    // Send final batch
    if (qdrantPointsBatch.length > 0) {
        console.log(`\nSending final batch of ${qdrantPointsBatch.length} points to Qdrant...`);
        try {
            // *** CORRECTED QDRANT CALL ***
            await qdrantClient.upsert(qdrantCollectionName, {
                wait: true,
                points: qdrantPointsBatch,
            });
        } catch (error) {
            console.error(` -> Error sending final batch to Qdrant:`, error);
        }
    }

    console.log('\nIngestion process completed successfully! ✅');
}

// Run the main function
ingestData().catch(error => {
    console.error('An unexpected error occurred during the ingestion script:', error);
});