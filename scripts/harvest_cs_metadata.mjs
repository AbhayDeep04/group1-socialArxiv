// Harvest Computer Science paper metadata from arXiv
// Supports both Kaggle dataset (initial load) and OAI-PMH (ongoing updates)

import dotenv from 'dotenv';
import path from 'path';
import Typesense from 'typesense';
import { QdrantClient } from '@qdrant/js-client-rest';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import readline from 'readline';
import https from 'https';
import http from 'http';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const parseXML = promisify(parseString);

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const typesenseCollectionName = 'papers';
const qdrantCollectionName = 'paper_semantics';
const embeddingModel = 'text-embedding-3-small';
const CHECKPOINT_FILE = path.join(__dirname, 'harvest_checkpoint.json');

// --- Initialize Clients ---
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

// --- Helper Functions ---

async function ensureTypesenseCollection() {
    try {
        await typesenseClient.collections(typesenseCollectionName).retrieve();
        console.log(`Typesense collection "${typesenseCollectionName}" already exists.`);
    } catch (error) {
        if (error.httpStatus === 404) {
            console.log(`Creating Typesense collection "${typesenseCollectionName}"...`);
            const schema = {
                name: typesenseCollectionName,
                fields: [
                    { name: 'title', type: 'string' },
                    { name: 'abstract', type: 'string' },
                    { name: 'authors', type: 'string[]', facet: true },
                    { name: 'categories', type: 'string[]', facet: true },
                    { name: 'year', type: 'int32', facet: true },
                    { name: 'pdfUrl', type: 'string' },
                    { name: 'source', type: 'string', facet: true },
                    { name: 'arxivId', type: 'string' },
                    { name: 'published', type: 'string' },
                ],
                default_sorting_field: 'year',
            };
            await typesenseClient.collections().create(schema);
            console.log('✅ Typesense collection created.');
        } else {
            throw error;
        }
    }
}

async function ensureQdrantCollection() {
    try {
        await qdrantClient.getCollection(qdrantCollectionName);
        console.log(`Qdrant collection "${qdrantCollectionName}" already exists.`);
    } catch (error) {
        if (error.status === 404) {
            console.log(`Creating Qdrant collection "${qdrantCollectionName}"...`);
            await qdrantClient.createCollection(qdrantCollectionName, {
                vectors: { size: 1536, distance: 'Cosine' },
            });
            await qdrantClient.createPayloadIndex(qdrantCollectionName, {
                field_name: "paperId",
                field_schema: "keyword",
                wait: true,
            });
            await qdrantClient.createPayloadIndex(qdrantCollectionName, {
                field_name: "level",
                field_schema: "keyword",
                wait: true,
            });
            console.log('✅ Qdrant collection created.');
        } else {
            throw error;
        }
    }
}

async function loadCheckpoint() {
    try {
        const data = await fs.readFile(CHECKPOINT_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return { lastProcessedDate: null, resumptionToken: null, processedCount: 0 };
    }
}

async function saveCheckpoint(checkpoint) {
    await fs.writeFile(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

// --- Kaggle Dataset Processing ---

async function processKaggleDataset(jsonFilePath) {
    console.log(`\n📦 Processing Kaggle dataset from: ${jsonFilePath}`);
    
    const fileStream = createReadStream(jsonFilePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let processedCount = 0;
    let batch = [];
    const BATCH_SIZE = 100;
    let embedBatch = [];
    const EMBED_BATCH_SIZE = 100;
    let qdrantBatch = [];

    for await (const line of rl) {
        try {
            const paper = JSON.parse(line);
            
            // Filter for CS papers only
            const categories = paper.categories ? paper.categories.split(' ') : [];
            const isCS = categories.some(cat => cat.startsWith('cs.'));
            
            if (!isCS) continue;

            // Extract year from published date
            const publishedDate = paper.versions?.[0]?.created || paper.update_date || '2024-01-01';
            const year = parseInt(publishedDate.substring(0, 4)) || 2024;

            // Prepare metadata for Typesense
            const metadata = {
                id: paper.id,
                title: paper.title || 'Untitled',
                abstract: paper.abstract || '',
                authors: paper.authors_parsed ? paper.authors_parsed.map(a => a.join(' ')) : [],
                categories: categories,
                year: year,
                pdfUrl: `https://arxiv.org/pdf/${paper.id}.pdf`,
                source: 'arxiv',
                arxivId: paper.id,
                published: publishedDate,
            };

            batch.push(metadata);
            
            // Prepare for embedding (title + abstract)
            const textToEmbed = `${metadata.title}\n\n${metadata.abstract}`;
            embedBatch.push({ paperId: paper.id, text: textToEmbed, metadata });

            // Process Typesense batch
            if (batch.length >= BATCH_SIZE) {
                await processTypesenseBatch(batch);
                batch = [];
            }

            // Process embedding batch
            if (embedBatch.length >= EMBED_BATCH_SIZE) {
                await processEmbeddingBatch(embedBatch, qdrantBatch);
                embedBatch = [];
            }

            processedCount++;
            if (processedCount % 1000 === 0) {
                console.log(`  Processed ${processedCount} CS papers...`);
            }

        } catch (error) {
            console.error('Error processing line:', error.message);
        }
    }

    // Process remaining batches
    if (batch.length > 0) {
        await processTypesenseBatch(batch);
    }
    if (embedBatch.length > 0) {
        await processEmbeddingBatch(embedBatch, qdrantBatch);
    }
    if (qdrantBatch.length > 0) {
        await flushQdrantBatch(qdrantBatch);
    }

    console.log(`\n✅ Kaggle dataset processing complete. Total CS papers: ${processedCount}`);
    return processedCount;
}

async function processTypesenseBatch(batch) {
    try {
        await typesenseClient.collections(typesenseCollectionName).documents().import(batch, {
            action: 'upsert'
        });
    } catch (error) {
        console.error('Error upserting to Typesense:', error.message);
    }
}

async function processEmbeddingBatch(embedBatch, qdrantBatch) {
    const texts = embedBatch.map(item => item.text);
    
    try {
        const response = await openaiClient.embeddings.create({
            model: embeddingModel,
            input: texts,
        });

        for (let i = 0; i < embedBatch.length; i++) {
            const { paperId, metadata } = embedBatch[i];
            const embedding = response.data[i].embedding;

            qdrantBatch.push({
                id: `${paperId}-abstract`,
                vector: embedding,
                payload: {
                    paperId: paperId,
                    level: 'abstract',
                    title: metadata.title,
                    abstract: metadata.abstract,
                    categories: metadata.categories,
                    year: metadata.year,
                },
            });
        }

        // Flush Qdrant batch if it's large enough
        if (qdrantBatch.length >= 100) {
            await flushQdrantBatch(qdrantBatch);
            qdrantBatch.length = 0;
        }

    } catch (error) {
        console.error('Error generating embeddings:', error.message);
    }
}

async function flushQdrantBatch(batch) {
    if (batch.length === 0) return;
    
    try {
        await qdrantClient.upsert(qdrantCollectionName, {
            wait: true,
            points: batch,
        });
        console.log(`  ✅ Upserted ${batch.length} abstract embeddings to Qdrant`);
    } catch (error) {
        console.error('Error upserting to Qdrant:', error.message);
    }
}

// --- OAI-PMH Harvesting ---

async function fetchOAIPMH(verb, params = {}) {
    const baseUrl = 'http://export.arxiv.org/oai2';
    const queryParams = new URLSearchParams({ verb, ...params });
    const url = `${baseUrl}?${queryParams}`;

    console.log(`  → Fetching: ${url.substring(0, 150)}...`);

    return new Promise((resolve, reject) => {
        const makeRequest = (requestUrl) => {
            const protocol = requestUrl.startsWith('https') ? https : http;
            
            protocol.get(requestUrl, (res) => {
                console.log(`  → Status: ${res.statusCode}`);
                
                // Handle redirects
                if (res.statusCode === 301 || res.statusCode === 302) {
                    const redirectUrl = res.headers.location;
                    console.log(`  → Redirecting to: ${redirectUrl}`);
                    makeRequest(redirectUrl);
                    return;
                }
                
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    console.log(`  → Received ${data.length} bytes`);
                    resolve(data);
                });
            }).on('error', (err) => {
                console.error(`  → HTTP Error:`, err.message);
                reject(err);
            });
        };
        
        makeRequest(url);
    });
}

async function harvestOAIPMH(fromDate = null) {
    console.log('\n🔄 Starting OAI-PMH harvest for CS papers...');
    
    let checkpoint = await loadCheckpoint();
    let resumptionToken = checkpoint.resumptionToken;
    let processedCount = checkpoint.processedCount || 0;
    let totalNew = 0;

    const params = {
        metadataPrefix: 'arXiv',
        set: 'cs', // Computer Science set
    };

    if (fromDate) {
        params.from = fromDate;
    } else if (checkpoint.lastProcessedDate) {
        params.from = checkpoint.lastProcessedDate;
    }

    try {
        while (true) {
            const requestParams = resumptionToken 
                ? { resumptionToken } 
                : params;

            console.log(`  Fetching batch (processed: ${processedCount})...`);
            
            const xmlData = await fetchOAIPMH('ListRecords', requestParams);
            const result = await parseXML(xmlData);

            if (!result || !result['OAI-PMH']) {
                console.error('Invalid OAI-PMH response. First 500 chars:', xmlData.substring(0, 500));
                throw new Error('Invalid OAI-PMH response format');
            }

            if (!result['OAI-PMH'].ListRecords) {
                // Check for errors in response
                if (result['OAI-PMH'].error) {
                    const errorMsg = result['OAI-PMH'].error[0];
                    console.error('OAI-PMH Error:', errorMsg);
                    throw new Error(`OAI-PMH Error: ${JSON.stringify(errorMsg)}`);
                }
                console.log('No more records to fetch.');
                break;
            }

            const records = result['OAI-PMH'].ListRecords[0].record || [];
            const newRecords = await processOAIPMHRecords(records);
            totalNew += newRecords;
            processedCount += records.length;

            // Check for resumption token
            const resumption = result['OAI-PMH'].ListRecords[0].resumptionToken;
            if (resumption && resumption[0] && resumption[0]._) {
                resumptionToken = resumption[0]._;
                
                // Save checkpoint
                await saveCheckpoint({
                    lastProcessedDate: new Date().toISOString().split('T')[0],
                    resumptionToken,
                    processedCount,
                });

                // Sleep for 3 seconds (arXiv recommended rate limit)
                await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
                // No more pages
                resumptionToken = null;
                break;
            }
        }

        // Final checkpoint
        await saveCheckpoint({
            lastProcessedDate: new Date().toISOString().split('T')[0],
            resumptionToken: null,
            processedCount,
        });

        console.log(`\n✅ OAI-PMH harvest complete. New/updated papers: ${totalNew}`);
    } catch (error) {
        console.error('Error during OAI-PMH harvest:', error);
        throw error;
    }
}

async function processOAIPMHRecords(records) {
    let batch = [];
    let embedBatch = [];
    let qdrantBatch = [];
    let newCount = 0;

    for (const record of records) {
        try {
            const metadata = record.metadata?.[0]?.arXiv?.[0];
            if (!metadata) continue;

            const arxivId = metadata.id?.[0];
            const title = metadata.title?.[0];
            const abstract = metadata.abstract?.[0];
            const authors = metadata.authors?.[0]?.author?.map(a => a.keyname?.[0]) || [];
            const categories = metadata.categories?.[0]?.split(' ') || [];
            const created = metadata.created?.[0];
            const year = created ? parseInt(created.substring(0, 4)) : 2024;

            const paperData = {
                id: arxivId,
                title: title || 'Untitled',
                abstract: abstract || '',
                authors: authors,
                categories: categories,
                year: year,
                pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
                source: 'arxiv',
                arxivId: arxivId,
                published: created,
            };

            batch.push(paperData);
            
            const textToEmbed = `${paperData.title}\n\n${paperData.abstract}`;
            embedBatch.push({ paperId: arxivId, text: textToEmbed, metadata: paperData });
            newCount++;

            // Process in smaller batches
            if (batch.length >= 50) {
                await processTypesenseBatch(batch);
                batch = [];
            }
            if (embedBatch.length >= 50) {
                await processEmbeddingBatch(embedBatch, qdrantBatch);
                embedBatch = [];
            }

        } catch (error) {
            console.error('Error processing OAI-PMH record:', error.message);
        }
    }

    // Process remaining
    if (batch.length > 0) await processTypesenseBatch(batch);
    if (embedBatch.length > 0) await processEmbeddingBatch(embedBatch, qdrantBatch);
    if (qdrantBatch.length > 0) await flushQdrantBatch(qdrantBatch);

    return newCount;
}

// --- Main ---

async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';

    console.log('🚀 arXiv CS Metadata Harvester\n');

    try {
        // Ensure collections exist
        await ensureTypesenseCollection();
        await ensureQdrantCollection();

        if (command === 'kaggle') {
            const jsonFilePath = args[1];
            if (!jsonFilePath) {
                console.error('❌ Please provide path to Kaggle JSON file');
                console.log('Usage: node harvest_cs_metadata.mjs kaggle <path-to-arxiv-metadata.json>');
                process.exit(1);
            }
            await processKaggleDataset(jsonFilePath);
        } else if (command === 'oai') {
            const fromDate = args[1]; // Optional: YYYY-MM-DD
            await harvestOAIPMH(fromDate);
        } else {
            console.log('Usage:');
            console.log('  node harvest_cs_metadata.mjs kaggle <path-to-json>  # Initial load from Kaggle');
            console.log('  node harvest_cs_metadata.mjs oai [YYYY-MM-DD]       # Harvest via OAI-PMH');
        }

        console.log('\n✅ All done!');
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

main();
