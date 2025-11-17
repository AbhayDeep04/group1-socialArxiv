// On-demand full-text PDF processing for individual papers
// Called when a user opens a paper or it appears in top search results

import dotenv from 'dotenv';
import path from 'path';
import { QdrantClient } from '@qdrant/js-client-rest';
import { fileURLToPath } from 'url';
import { v5 as uuidv5 } from 'uuid';
import OpenAI from 'openai';
import https from 'https';
import http from 'http';
import fs from 'fs';
import { PdfReader } from 'pdfreader';
import os from 'os';

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Only load .env.local in local development (not on Vercel)
if (!process.env.VERCEL) {
    dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
}

// Validate required environment variables
if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY || !process.env.OPENAI_API_KEY) {
    throw new Error('Missing required environment variables: QDRANT_URL, QDRANT_API_KEY, or OPENAI_API_KEY');
}

const qdrantCollectionName = 'paper_semantics';
const embeddingModel = 'text-embedding-3-small';
const chunkSize = 500; // characters
const chunkOverlap = 50;
const QDRANT_UUID_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';

// --- Initialize Clients ---
const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- Helper Functions ---

async function downloadPDF(url, outputPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(outputPath);
        const maxRedirects = 10;

        const handleRequest = (requestUrl, redirectCount = 0) => {
            let urlObj;
            try {
                urlObj = new URL(requestUrl);
            } catch (e) {
                file.close();
                fs.unlink(outputPath, () => {});
                return reject(new Error(`Invalid URL: ${requestUrl}`));
            }

            const client = urlObj.protocol === 'https:' ? https : http;

            const req = client.get(urlObj, (response) => {
                const code = response.statusCode || 0;

                // Handle redirects
                if ([301, 302, 303, 307, 308].includes(code)) {
                    const loc = response.headers.location;
                    if (!loc) {
                        file.close();
                        fs.unlink(outputPath, () => {});
                        return reject(new Error('Redirect with no Location header'));
                    }
                    if (redirectCount >= maxRedirects) {
                        file.close();
                        fs.unlink(outputPath, () => {});
                        return reject(new Error('Too many redirects'));
                    }

                    // Resolve relative URLs to absolute
                    const nextUrl = new URL(loc, urlObj).toString();
                    console.log(`     ↳ Redirecting to: ${nextUrl}`);
                    response.resume(); // discard data before following
                    return handleRequest(nextUrl, redirectCount + 1);
                }

                // Non-OK status
                if (code !== 200) {
                    file.close();
                    fs.unlink(outputPath, () => {});
                    return reject(new Error(`Failed to download PDF: ${code}`));
                }

                // Success - pipe to file
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(outputPath);
                });
            });

            req.on('error', (err) => {
                file.close();
                fs.unlink(outputPath, () => {});
                reject(err);
            });
        };

        handleRequest(url);
    });
}

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

function chunkText(text, size, overlap) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = start + size;
        chunks.push(text.slice(start, end));
        start += size - overlap;
        if (size - overlap <= 0) {
            if (start === 0 && text.length > 0) break;
            start = end;
        }
    }
    return chunks.filter(chunk => chunk && chunk.trim().length > 0);
}

async function ensureQdrantCollection() {
    try {
        await qdrantClient.getCollection(qdrantCollectionName);
    } catch (error) {
        if (error.status === 404) {
            console.log(`Creating Qdrant collection "${qdrantCollectionName}"...`);
            await qdrantClient.createCollection(qdrantCollectionName, {
                vectors: { size: 1536, distance: 'Cosine' },
            });
            console.log(`✅ Created Qdrant collection`);
        } else {
            throw error;
        }
    }
}

async function checkIfAlreadyHydrated(paperId) {
    try {
        const result = await qdrantClient.scroll(qdrantCollectionName, {
            filter: {
                must: [
                    { key: 'paperId', match: { value: paperId } },
                    { key: 'level', match: { value: 'fulltext' } }
                ]
            },
            limit: 1,
        });
        return result.points.length > 0;
    } catch (error) {
        console.error('Error checking hydration status:', error.message);
        return false;
    }
}

async function hydrateFullText(paperId, pdfUrl) {
    console.log(`\n🔄 Hydrating full text for paper: ${paperId}`);
    console.log(`   PDF URL: ${pdfUrl}`);

    // Ensure Qdrant collection exists
    await ensureQdrantCollection();

    // Check if already processed
    const alreadyHydrated = await checkIfAlreadyHydrated(paperId);
    if (alreadyHydrated) {
        console.log(`✅ Paper ${paperId} already has full-text embeddings. Skipping.`);
        return { success: true, cached: true };
    }

    const startTime = Date.now();
    const tempPdfPath = path.join(os.tmpdir(), `${paperId}.pdf`);

    try {
        // Step 1: Download PDF (1-3 seconds)
        console.log('  1️⃣  Downloading PDF...');
        const downloadStart = Date.now();
        await downloadPDF(pdfUrl, tempPdfPath);
        console.log(`     ✓ Downloaded in ${Date.now() - downloadStart}ms`);

        // Step 2: Extract text (2-5 seconds)
        console.log('  2️⃣  Extracting text...');
        const extractStart = Date.now();
        const fullText = await extractTextFromPDF(tempPdfPath);
        console.log(`     ✓ Extracted ${fullText.length} characters in ${Date.now() - extractStart}ms`);

        if (!fullText || fullText.trim().length < 100) {
            throw new Error('Insufficient text extracted from PDF');
        }

        // Step 3: Chunk text (<1 second)
        console.log('  3️⃣  Chunking text...');
        const chunks = chunkText(fullText, chunkSize, chunkOverlap);
        console.log(`     ✓ Created ${chunks.length} chunks`);

        if (chunks.length === 0) {
            throw new Error('No chunks generated from text');
        }

        // Step 4: Generate embeddings (3-8 seconds for typical paper)
        console.log('  4️⃣  Generating embeddings...');
        const embedStart = Date.now();
        let chunkEmbeddings = [];
        const embeddingBatchSize = 100;

        for (let i = 0; i < chunks.length; i += embeddingBatchSize) {
            const batchChunks = chunks.slice(i, i + embeddingBatchSize);
            const response = await openaiClient.embeddings.create({
                model: embeddingModel,
                input: batchChunks,
            });
            chunkEmbeddings.push(...response.data.map(d => d.embedding));
            console.log(`     ✓ Batch ${Math.floor(i / embeddingBatchSize) + 1}/${Math.ceil(chunks.length / embeddingBatchSize)}`);
        }
        console.log(`     ✓ Generated embeddings in ${Date.now() - embedStart}ms`);

        // Step 5: Store in Qdrant (<1 second)
        console.log('  5️⃣  Storing in Qdrant...');
        const storeStart = Date.now();
        const qdrantPoints = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunkId = uuidv5(`${paperId}_fulltext_${i}`, QDRANT_UUID_NAMESPACE);
            qdrantPoints.push({
                id: chunkId,
                vector: chunkEmbeddings[i],
                payload: {
                    paperId: paperId,
                    level: 'fulltext',
                    chunkText: chunks[i],
                    chunkIndex: i,
                },
            });
        }

        // Batch upsert to Qdrant
        const qdrantBatchSize = 100;
        for (let i = 0; i < qdrantPoints.length; i += qdrantBatchSize) {
            const batch = qdrantPoints.slice(i, i + qdrantBatchSize);
            await qdrantClient.upsert(qdrantCollectionName, {
                wait: true,
                points: batch,
            });
        }
        console.log(`     ✓ Stored in ${Date.now() - storeStart}ms`);

        const totalTime = Date.now() - startTime;
        console.log(`\n✅ Full-text hydration complete for ${paperId}`);
        console.log(`   Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`);
        console.log(`   Chunks processed: ${chunks.length}`);

        return {
            success: true,
            cached: false,
            stats: {
                paperId,
                chunks: chunks.length,
                textLength: fullText.length,
                processingTimeMs: totalTime,
            }
        };

    } catch (error) {
        console.error(`❌ Error hydrating ${paperId}:`, error.message);
        return {
            success: false,
            error: error.message,
        };
    } finally {
        // Cleanup: remove temp PDF
        try {
            fs.unlinkSync(tempPdfPath);
        } catch (err) {
            // Ignore cleanup errors
        }
    }
}

// --- Batch Processing ---

async function hydrateBatch(papers) {
    console.log(`\n🔄 Batch hydrating ${papers.length} papers...\n`);
    
    const results = [];
    for (const paper of papers) {
        const result = await hydrateFullText(paper.paperId, paper.pdfUrl);
        results.push(result);
        
        // Small delay between papers to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const successful = results.filter(r => r.success).length;
    const cached = results.filter(r => r.cached).length;
    const failed = results.filter(r => !r.success).length;

    console.log('\n📊 Batch Results:');
    console.log(`   ✅ Successful: ${successful}`);
    console.log(`   💾 Cached: ${cached}`);
    console.log(`   ❌ Failed: ${failed}`);

    return results;
}

// --- Main ---

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage:');
        console.log('  node hydrate_fulltext.mjs <arxiv-id>');
        console.log('  node hydrate_fulltext.mjs <arxiv-id> <pdf-url>');
        console.log('\nExamples:');
        console.log('  node hydrate_fulltext.mjs 2301.07041');
        console.log('  node hydrate_fulltext.mjs 2301.07041 https://arxiv.org/pdf/2301.07041.pdf');
        process.exit(1);
    }

    const paperId = args[0];
    const pdfUrl = args[1] || `https://arxiv.org/pdf/${paperId}.pdf`;

    console.log('🚀 On-Demand Full-Text Hydration\n');

    try {
        const result = await hydrateFullText(paperId, pdfUrl);
        
        if (result.success) {
            console.log('\n✅ Success!');
            process.exit(0);
        } else {
            console.log('\n❌ Failed!');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

// Export for API use
export { hydrateFullText, hydrateBatch, checkIfAlreadyHydrated };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
