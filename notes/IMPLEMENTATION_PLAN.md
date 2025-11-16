# SocialArxiv - Complete Implementation Plan
**Timeline: 24 Hours**  
**Current Status**: Basic paper search, PDF reader, single-turn RAG chat, user auth

---

## **ARCHITECTURE OVERVIEW**

### **Demo Flow Visualization**

![Demo Flow](diagram above) - See how the system handles ANY paper request from the audience!

- **80-90% of requests**: Pre-loaded papers → INSTANT response 
- **10-20% of requests**: On-demand processing → Professional 10-15 sec UI 
- **Either way**: You look prepared and impressive!

### **Hybrid On-Demand Strategy**

Unlike traditional approaches that pre-process everything, we use a smart hybrid model:

```
┌──────────────────────────────────────────────────────────────┐
│  HOME PAGE SEARCH (Instant)                                  │
│  • 10,000+ papers indexed in Typesense (metadata only)       │
│  • Query: title, abstract, authors, categories               │
│  • Setup time: 15-30 minutes                                 │
│  • Storage: ~100MB                                           │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  RAG CHAT (Smart Processing)                                 │
│                                                              │
│  ┌────────────────────────────────────────────────┐          │
│  │  500-1000 Popular Papers (Pre-loaded)          │          │
│  │  ✅ Instant chat (0-2 seconds)                 │          │
│  │  ✅ Perfect for live demos                     │          │
│  │  ✅ Covers ~80-90% of requests                 │          │
│  │  • Setup time: 2-3 hours (run overnight)       │          │
│  └────────────────────────────────────────────────┘          │
│                                                              │
│  9,000+ Other Papers (On-Demand)                             │
│  • First chat: 10-15 seconds (with slick progress UI)        │
│  • Subsequent chats: Instant (cached in Qdrant)              │
│  • Only process papers users actually use                    │
└──────────────────────────────────────────────────────────────┘
```

### **Why This Approach?**

✅ **arXiv API returns metadata ONLY** (title, abstract, authors, PDF link)  
✅ **PDF text extraction** must be done separately (download → parse → chunk → embed)  
✅ **Search doesn't need PDF text** (abstract is enough)  
✅ **RAG only needs processing when user chats** (not for browsing)  
✅ **Demo-ready**: Pre-load popular papers overnight for instant demos  
✅ **Cost-effective**: Only process papers people use (~$0.40 for 500 papers)

---

## PHASE 0: DEMO PREPARATION (Night Before / Hours -3 to 0)

### 0.1 Sync Paper Metadata (10,000+ Papers)
**Priority: CRITICAL** | **Time: 30min** | **Run First**

**File: `/scripts/sync-arxiv-metadata.mjs`**

```javascript
import Typesense from 'typesense';
import axios from 'axios';
import xml2js from 'xml2js';

const typesenseClient = new Typesense.Client({
  nodes: [{
    host: process.env.NEXT_PUBLIC_TYPESENSE_HOST,
    port: parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT),
    protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL,
  }],
  apiKey: process.env.TYPESENSE_ADMIN_API_KEY,
});

// Popular CS categories
const CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CV', 'cs.CL', 'cs.NE', 'cs.RO'];

async function fetchArxivMetadata(category, maxResults = 2000) {
  console.log(`📚 Fetching ${category} papers from arXiv API...`);
  
  const url = `http://export.arxiv.org/api/query?search_query=cat:${category}&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;
  
  const response = await axios.get(url);
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(response.data);
  
  if (!result.feed.entry) {
    return [];
  }
  
  const papers = result.feed.entry.map(entry => {
    const pdfLink = entry.link.find(l => l.$.title === 'pdf');
    
    return {
      id: entry.id[0].split('/abs/')[1].split('v')[0], // Extract clean ID
      title: entry.title[0].trim(),
      abstract: entry.summary[0].trim(),
      authors: entry.author.map(a => a.name[0]),
      year: parseInt(entry.published[0].substring(0, 4)),
      categories: entry.category?.map(c => c.$.term) || [],
      pdfUrl: pdfLink ? pdfLink.$.href : '',
      source: 'arxiv',
    };
  });
  
  return papers;
}

async function syncMetadata() {
  console.log('🚀 Starting metadata sync...\n');
  let totalSynced = 0;
  
  for (const category of CATEGORIES) {
    const papers = await fetchArxivMetadata(category, 2000);
    console.log(`   Found ${papers.length} ${category} papers`);
    
    // Index in Typesense (metadata only - NO PDF processing!)
    for (const paper of papers) {
      try {
        await typesenseClient.collections('papers').documents().upsert(paper);
        totalSynced++;
      } catch (error) {
        console.error(`   ⚠️  Error indexing ${paper.id}:`, error.message);
      }
    }
    
    console.log(`   ✅ Indexed ${papers.length} papers from ${category}\n`);
    
    // Respect arXiv rate limit (1 request per 3 seconds)
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log(`🎉 Metadata sync complete! ${totalSynced} papers searchable.`);
}

syncMetadata().catch(console.error);
```

**Tasks:**
- [ ] Install dependencies: `npm install axios xml2js`
- [ ] Create sync-arxiv-metadata.mjs script
- [ ] Run to index 10,000+ papers (30 minutes)
- [ ] Verify papers in Typesense
- [ ] Add to package.json: `"sync-metadata": "node scripts/sync-arxiv-metadata.mjs"`

---

### 0.2 Pre-load Popular Papers for Demo
**Priority: CRITICAL** | **Time: 2-3h** | **Run Overnight Before Demo**

**File: `/scripts/preload-demo-papers.mjs`**

```javascript
import Typesense from 'typesense';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import pdf from 'pdf-parse';
import axios from 'axios';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

const typesenseClient = new Typesense.Client({
  nodes: [{
    host: process.env.NEXT_PUBLIC_TYPESENSE_HOST,
    port: parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT),
    protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL,
  }],
  apiKey: process.env.TYPESENSE_ADMIN_API_KEY,
});

// Pre-load strategy: Recent papers + famous papers
const PRELOAD_CONFIG = {
  // Top categories to pre-load (most likely to be requested in demo)
  categories: ['cs.AI', 'cs.LG', 'cs.CV', 'cs.CL'],
  maxPerCategory: 125, // 500 papers total from categories
  minYear: 2023, // Only recent papers
  
  // Specific famous papers to guarantee instant demo
  guaranteedPapers: [
    '2010.11929', // GPT-3 (Language Models are Few-Shot Learners)
    '1706.03762', // Attention Is All You Need (Transformer)
    '2303.08774', // GPT-4 Technical Report
    '1810.04805', // BERT
    '2005.14165', // GPT-3 Paper
    '2204.02311', // PaLM
    '2307.09288', // Llama 2
    '2103.00020', // CLIP
    '2001.08361', // Vision Transformer
    '1412.6980',  // Adam optimizer
  ],
};

async function preloadDemoPapers() {
  console.log('🚀 Pre-loading papers for instant demo experience...\n');
  console.log(`Target: ${PRELOAD_CONFIG.categories.length * PRELOAD_CONFIG.maxPerCategory + PRELOAD_CONFIG.guaranteedPapers.length} papers\n`);
  
  const papersToProcess = new Set();
  
  // 1. Fetch recent papers from each category
  for (const category of PRELOAD_CONFIG.categories) {
    console.log(`📚 Fetching recent ${category} papers (${PRELOAD_CONFIG.minYear}+)...`);
    
    const searchResults = await typesenseClient
      .collections('papers')
      .documents()
      .search({
        q: '*',
        filter_by: `categories:=${category} && year:>=${PRELOAD_CONFIG.minYear}`,
        sort_by: 'year:desc',
        per_page: PRELOAD_CONFIG.maxPerCategory,
      });
    
    const papers = searchResults.hits?.map(hit => hit.document) || [];
    papers.forEach(p => papersToProcess.add(JSON.stringify(p)));
    console.log(`   ✅ Added ${papers.length} ${category} papers`);
  }
  
  // 2. Add guaranteed famous papers
  console.log(`\n⭐ Adding ${PRELOAD_CONFIG.guaranteedPapers.length} guaranteed papers...`);
  for (const paperId of PRELOAD_CONFIG.guaranteedPapers) {
    try {
      const paper = await typesenseClient
        .collections('papers')
        .documents(paperId)
        .retrieve();
      papersToProcess.add(JSON.stringify(paper));
      console.log(`   ✅ Added ${paper.title.substring(0, 50)}...`);
    } catch (error) {
      console.log(`   ⚠️  Could not find ${paperId} - will sync from arXiv`);
    }
  }
  
  const papers = Array.from(papersToProcess).map(p => JSON.parse(p));
  console.log(`\n📊 Total papers to pre-process: ${papers.length}`);
  console.log(`⏱️  Estimated time: ${Math.ceil(papers.length * 0.3)} minutes\n`);
  
  // 3. Process each paper
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const paper of papers) {
    try {
      const wasProcessed = await processPaperForRAG(paper);
      if (wasProcessed === 'skipped') {
        skipped++;
      } else {
        processed++;
      }
      
      const progress = Math.floor(((processed + failed + skipped) / papers.length) * 100);
      console.log(`[${progress}%] ✅ ${processed} processed | ⏭️  ${skipped} cached | ❌ ${failed} failed`);
      
    } catch (error) {
      failed++;
      console.log(`❌ Failed ${paper.id}: ${error.message}`);
    }
  }
  
  console.log(`\n🎉 Pre-loading complete!`);
  console.log(`   ✅ Processed: ${processed}`);
  console.log(`   ⏭️  Already cached: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`\n💡 You can now demo with ~${processed + skipped} papers instantly!`);
}

async function processPaperForRAG(paper) {
  // Check if already processed
  const existing = await qdrant.scroll('paper_chunks', {
    filter: { must: [{ key: 'paperId', match: { value: paper.id } }] },
    limit: 1,
  });
  
  if (existing.points && existing.points.length > 0) {
    return 'skipped'; // Already in Qdrant
  }
  
  // Download PDF
  const pdfResponse = await axios.get(paper.pdfUrl, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: 50 * 1024 * 1024, // 50MB max
  });
  
  // Extract text
  const data = await pdf(pdfResponse.data);
  
  // Chunk text
  const chunks = chunkText(data.text, paper.id);
  
  // Generate embeddings in batches (MUCH faster!)
  const points = [];
  const batchSize = 50; // Process 50 chunks at once
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    // Batch embedding request (saves API calls!)
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch.map(c => c.text),
    });
    
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      points.push({
        id: `${paper.id}:${chunk.page}:${i + j}`,
        vector: embeddingResponse.data[j].embedding,
        payload: {
          paperId: paper.id,
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          pageStart: chunk.page,
          pageEnd: chunk.page,
          text: chunk.text,
          preloaded: true, // Mark as pre-processed for analytics
        },
      });
    }
  }
  
  // Store in Qdrant
  await qdrant.upsert('paper_chunks', { points });
  
  return 'processed';
}

function chunkText(text, paperId) {
  // Split by form feed (page separator in PDF)
  const pages = text.split('\f');
  const chunks = [];
  
  pages.forEach((pageText, pageIndex) => {
    const sentences = pageText.match(/[^.!?]+[.!?]+/g) || [];
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > 400) {
        if (currentChunk.trim()) {
          chunks.push({
            text: currentChunk.trim(),
            page: pageIndex + 1,
          });
          chunkIndex++;
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

preloadDemoPapers().catch(console.error);
```

**Tasks:**
- [ ] Install: `npm install pdf-parse axios xml2js`
- [ ] Create preload script
- [ ] **RUN OVERNIGHT** before demo day: `node scripts/preload-demo-papers.mjs`
- [ ] Verify in Qdrant: should see ~200,000 chunks
- [ ] Test instant chat on pre-loaded papers
- [ ] Add to package.json: `"preload-demo": "node scripts/preload-demo-papers.mjs"`

---

### 0.3 On-Demand Processing API (For Non-Preloaded Papers)
**Priority: HIGH** | **Time: 1h**

**File: `/app/api/papers/[paperId]/process/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import pdf from 'pdf-parse';
import axios from 'axios';
import Typesense from 'typesense';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
});

const typesense = new Typesense.Client({
  nodes: [{
    host: process.env.NEXT_PUBLIC_TYPESENSE_HOST || '',
    port: parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT || '443'),
    protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || 'https',
  }],
  apiKey: process.env.TYPESENSE_ADMIN_API_KEY!,
});

export async function POST(
  request: NextRequest,
  { params }: { params: { paperId: string } }
) {
  const { paperId } = params;
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const sendProgress = (message: string, progress: number) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ message, progress })}\n\n`)
          );
        };
        
        sendProgress('Checking if paper is ready...', 10);
        
        // 1. Check if already in Qdrant
        const existing = await qdrant.scroll('paper_chunks', {
          filter: { must: [{ key: 'paperId', match: { value: paperId } }] },
          limit: 1,
        });
        
        if (existing.points && existing.points.length > 0) {
          sendProgress('Paper already processed!', 100);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, cached: true })}\n\n`)
          );
          controller.close();
          return;
        }
        
        sendProgress('Fetching paper metadata...', 20);
        
        // 2. Get paper from Typesense
        const paperDoc = await typesense
          .collections('papers')
          .documents(paperId)
          .retrieve();
        
        sendProgress('Downloading PDF...', 30);
        
        // 3. Download PDF
        const pdfResponse = await axios.get(paperDoc.pdfUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
        });
        
        sendProgress('Extracting text from PDF...', 50);
        
        // 4. Extract text
        const data = await pdf(pdfResponse.data);
        
        sendProgress('Creating text chunks...', 60);
        
        // 5. Chunk text
        const chunks = chunkText(data.text);
        
        sendProgress(`Generating AI embeddings (${chunks.length} chunks)...`, 70);
        
        // 6. Generate embeddings in batches
        const points = [];
        const batchSize = 50;
        
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(chunks.length / batchSize);
          
          const batchProgress = 70 + Math.floor(((i + batch.length) / chunks.length) * 20);
          sendProgress(
            `Embedding batch ${batchNum}/${totalBatches}...`,
            batchProgress
          );
          
          const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: batch.map(c => c.text),
          });
          
          for (let j = 0; j < batch.length; j++) {
            const chunk = batch[j];
            points.push({
              id: `${paperId}:${chunk.page}:${i + j}`,
              vector: embeddingResponse.data[j].embedding,
              payload: {
                paperId,
                title: paperDoc.title,
                authors: paperDoc.authors,
                year: paperDoc.year,
                pageStart: chunk.page,
                pageEnd: chunk.page,
                text: chunk.text,
              },
            });
          }
        }
        
        sendProgress('Storing in vector database...', 95);
        
        // 7. Store in Qdrant
        await qdrant.upsert('paper_chunks', { points });
        
        sendProgress('Complete! Paper ready for chat.', 100);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, chunks: points.length })}\n\n`)
        );
        controller.close();
        
      } catch (error: any) {
        console.error('Processing error:', error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`)
        );
        controller.close();
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function chunkText(text: string) {
  const pages = text.split('\f');
  const chunks: Array<{ text: string; page: number }> = [];
  
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
```

**File: `/app/api/papers/[paperId]/check-processed/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
});

export async function GET(
  request: NextRequest,
  { params }: { params: { paperId: string } }
) {
  try {
    const existing = await qdrant.scroll('paper_chunks', {
      filter: { must: [{ key: 'paperId', match: { value: params.paperId } }] },
      limit: 1,
    });
    
    return NextResponse.json({
      isProcessed: existing.points && existing.points.length > 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

**Tasks:**
- [ ] Create on-demand processing API with streaming progress
- [ ] Create check-processed API endpoint
- [ ] Test with a paper NOT in pre-load list
- [ ] Verify ~10-15 second processing time
- [ ] Verify subsequent chats are instant

---

## PHASE 1: CORE INFRASTRUCTURE (Hours 0-4)

### 1.1 Database Schema Setup - Firestore Collections
**Priority: CRITICAL** | **Time: 1h**

#### Collections to Create:
```typescript
// users/{uid}/profile
{
  displayName: string;
  email: string;
  bio?: string;
  avatarUrl?: string;
  following: string[]; // array of user IDs
  followers: string[]; // array of user IDs
  favoriteCategories: string[]; // e.g., ["cs.AI", "cs.LG"]
  createdAt: timestamp;
  updatedAt: timestamp;
}

// users/{uid}/library
{
  paperId: string;
  addedAt: timestamp;
  lastRead: timestamp;
  readingProgress: number; // 0-100
  personalRating?: number; // 1-5
  personalNotes?: string;
  tags: string[];
}

// users/{uid}/uploads
{
  id: string; // auto-generated
  fileName: string;
  title: string;
  authors: string[];
  year?: number;
  abstract?: string;
  pdfUrl: string; // Firebase Storage path
  uploadedAt: timestamp;
  fileSize: number;
  pageCount?: number;
}

// users/{uid}/conversations/{conversationId}
{
  title: string;
  paperIds: string[]; // papers in scope via @mentions
  memorySummary: string; // rolling summary of conversation
  createdAt: timestamp;
  updatedAt: timestamp;
  settings: {
    summaryLength: 'short' | 'medium' | 'long';
    topK?: number;
  };
}

// users/{uid}/conversations/{conversationId}/messages
{
  id: string;
  role: 'user' | 'assistant' | 'system' | 'event';
  content: string; // includes [S1], [S2] citation markers
  citations: Array<{
    sid: string; // e.g., "S1"
    chunkId: string;
    paperId: string;
    title: string;
    pageStart: number;
    pageEnd: number;
    textSnippet: string;
    score: number;
  }>;
  tokensIn?: number;
  tokensOut?: number;
  createdAt: timestamp;
  eventType?: 'add_papers'; // for system messages
}

// papers/{paperId}/ratings
{
  userId: string;
  rating: number; // 1-5
  createdAt: timestamp;
  updatedAt: timestamp;
}

// papers/{paperId}/comments
{
  id: string;
  userId: string;
  userName: string;
  content: string;
  parentId?: string; // for threaded replies
  upvotes: number;
  downvotes: number;
  votedBy: { [userId: string]: 'up' | 'down' };
  createdAt: timestamp;
  updatedAt: timestamp;
}

// papers/{paperId}/metadata
{
  title: string;
  authors: string[];
  abstract: string;
  year: number;
  categories: string[];
  pdfUrl: string;
  source: string;
  averageRating?: number;
  ratingCount: number;
  commentCount: number;
  viewCount: number;
  lastViewed: timestamp;
}

// feed_events (for activity feed)
{
  id: string;
  userId: string;
  userName: string;
  eventType: 'read' | 'rated' | 'commented' | 'uploaded';
  paperId: string;
  paperTitle: string;
  metadata?: any; // rating value, comment preview, etc.
  createdAt: timestamp;
}
```

**Tasks:**
- [x] Create Firestore security rules for all collections
- [x] Create TypeScript interfaces matching schemas in `/lib/types.ts`
- [x] Create helper functions in `/lib/firestore-helpers.ts`

---

### 1.2 Multi-turn RAG Architecture Setup
**Priority: CRITICAL** | **Time: 2h**

#### A. Qdrant Vector Index for Chunks
**Already exists but verify structure:**
```typescript
// Collection: paper_chunks
{
  id: string; // format: "paperId:pageNum:chunkIndex"
  vector: number[]; // embedding
  payload: {
    paperId: string;
    title: string;
    authors: string[];
    year: number;
    pageStart: number;
    pageEnd: number;
    text: string; // 200-400 char snippet for highlighting
    section?: string;
    hash: string;
  }
}
```

#### B. Vercel AI SDK Client Setup
**File: `/lib/ai-client.ts`**
```typescript
import { openai } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';

export const MODELS = {
  CHAT: 'gpt-4o-mini', // Cost-effective for chat
  EMBEDDINGS: 'text-embedding-3-small',
} as const;

// Single embedding generation
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding(MODELS.EMBEDDINGS),
    value: text,
  });
  return embedding;
}

// Batch embedding generation (up to 2048 texts per batch - much faster!)
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: openai.embedding(MODELS.EMBEDDINGS),
    values: texts,
  });
  return embeddings;
}

// Export openai instance for use in chat API routes
export { openai };
```

**File: `/lib/types.ts`** (New file for shared TypeScript types)
```typescript
import { UIMessage } from 'ai';

// Citation data structure for RAG responses
export type CitationData = {
  citation: {
    sid: string;           // S1, S2, S3, etc.
    chunkId: string;       // Qdrant point ID
    paperId: string;       // arXiv paper ID
    title: string;         // Paper title
    pageStart: number;     // Page range start
    pageEnd: number;       // Page range end
    textSnippet: string;   // Actual text chunk
    score: number;         // Relevance score from vector search
  };
};

// Message type with citation data parts
export type ChatMessageWithCitations = UIMessage<never, CitationData>;

// Retrieved chunk from Qdrant
export interface RetrievedChunk {
  sid: string;
  chunkId: string;
  paperId: string;
  title: string;
  pageStart: number;
  pageEnd: number;
  textSnippet: string;
  score: number;
}
```

#### C. Qdrant Client Enhancement
**File: `/lib/qdrant-client.ts`**
```typescript
import { QdrantClient } from '@qdrant/js-client-rest';

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
});

export async function retrieveChunks(params: {
  query: string;
  paperIds?: string[];
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const { query, paperIds, topK = 20 } = params;
  
  const embedding = await generateEmbedding(query);
  
  const filter = paperIds?.length
    ? {
        must: [{
          key: 'paperId',
          match: { any: paperIds }
        }]
      }
    : undefined;
  
  const results = await qdrant.search('paper_chunks', {
    vector: embedding,
    limit: topK,
    filter,
    with_payload: true,
  });
  
  return results.map((r, i) => ({
    sid: `S${i + 1}`,
    chunkId: r.id as string,
    paperId: r.payload.paperId as string,
    title: r.payload.title as string,
    pageStart: r.payload.pageStart as number,
    pageEnd: r.payload.pageEnd as number,
    textSnippet: r.payload.text as string,
    score: r.score,
  }));
}
```

**Tasks:**
- [x] Install OpenAI SDK: `npm install openai`
- [x] Add `OPENAI_API_KEY` to `.env.local`
- [x] Create `/lib/ai-client.ts`
- [x] Update `/lib/qdrant-client.ts` with retrieval function
- [x] Test embedding generation
- [x] Verify Qdrant chunk structure matches requirements

---

### 1.3 Enhanced Multi-turn Chat API with Vercel AI SDK
**Priority: CRITICAL** | **Time: 2h**

**File: `/app/api/chat/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { openai, MODELS } from '@/lib/ai-client';
import { retrieveChunks } from '@/lib/qdrant-client';
import { db } from '@/lib/firebaseConfig';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc,
  setDoc,
  query,
  orderBy,
  limit as firestoreLimit 
} from 'firebase/firestore';
import { 
  streamText, 
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText
} from 'ai';
import type { ChatMessageWithCitations, RetrievedChunk } from '@/lib/types';

const MEMORY_TOKEN_THRESHOLD = 2500;
const MAX_HISTORY_MESSAGES = 10;

export const maxDuration = 30; // Vercel serverless function timeout

export async function POST(request: NextRequest) {
  try {
    const {
      messages,
      userId,
      conversationId,
      summaryLength = 'medium',
      addedPaperIds = [],
    }: {
      messages: ChatMessageWithCitations[];
      userId: string;
      conversationId: string;
      summaryLength?: 'short' | 'medium' | 'long';
      addedPaperIds?: string[];
    } = await request.json();
    
    // Extract the latest user message
    const userMessage = messages[messages.length - 1].parts
      .filter(p => p.type === 'text')
      .map(p => p.text)
      .join('');
    
    // 1. Load or create conversation
    const convRef = doc(db, `users/${userId}/conversations/${conversationId}`);
    let conversation = (await getDoc(convRef)).data();
    
    if (!conversation) {
      await setDoc(convRef, {
        title: userMessage.substring(0, 50) + '...',
        paperIds: addedPaperIds,
        memorySummary: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: { summaryLength },
      });
      conversation = (await getDoc(convRef)).data()!;
    } else if (addedPaperIds.length > 0) {
      const updatedPaperIds = Array.from(
        new Set([...conversation.paperIds, ...addedPaperIds])
      );
      await updateDoc(convRef, {
        paperIds: updatedPaperIds,
        updatedAt: new Date(),
      });
      conversation.paperIds = updatedPaperIds;
    }
    
    // 2. Retrieve recent messages from Firestore
    const messagesRef = collection(db, `users/${userId}/conversations/${conversationId}/messages`);
    const messagesQuery = query(
      messagesRef,
      orderBy('createdAt', 'desc'),
      firestoreLimit(MAX_HISTORY_MESSAGES)
    );
    const messageDocs = await getDocs(messagesQuery);
    const recentMessages = messageDocs.docs
      .map(d => d.data())
      .reverse();
    
    // 3. Retrieve context chunks from Qdrant
    const chunks = await retrieveChunks({
      query: userMessage,
      paperIds: conversation.paperIds.length > 0 ? conversation.paperIds : undefined,
      topK: 12,
    });
    
    const diverseChunks = diversifyChunks(chunks, 10, 3);
    
    // 4. Build context string with [S#] markers
    const contextString = diverseChunks
      .map((chunk, i) => 
        `[S${i+1}] ${chunk.title} (${chunk.paperId}), p.${chunk.pageStart}: "${chunk.textSnippet}"`
      )
      .join('\n\n');
    
    // 5. Create UI message stream with custom citation data
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Send citation data first (before streaming starts)
        diverseChunks.forEach((chunk, idx) => {
          writer.write({
            type: 'data-citation',
            id: `citation-${chunk.chunkId}`,
            data: {
              sid: chunk.sid,
              chunkId: chunk.chunkId,
              paperId: chunk.paperId,
              title: chunk.title,
              pageStart: chunk.pageStart,
              pageEnd: chunk.pageEnd,
              textSnippet: chunk.textSnippet,
              score: chunk.score,
            },
          });
        });
        
        // Build system prompt
        const systemPrompt = buildSystemPrompt(summaryLength);
        let systemMessages = [{ role: 'system' as const, content: systemPrompt }];
        
        if (conversation.memorySummary) {
          systemMessages.push({
            role: 'system' as const,
            content: `Previous conversation summary: ${conversation.memorySummary}`,
          });
        }
        
        // Build message array for LLM
        const llmMessages = [
          ...systemMessages,
          ...convertToModelMessages(messages.slice(0, -1)), // Previous messages
          {
            role: 'user' as const,
            content: `Context:\n${contextString}\n\nQuestion: ${userMessage}`,
          },
        ];
        
        // Stream the LLM response
        const result = streamText({
          model: openai(MODELS.CHAT),
          messages: llmMessages,
          temperature: 0.3,
          maxTokens: 2000,
          abortSignal: request.signal, // Proper cleanup on disconnect
        });
        
        // Merge the LLM stream into the UI message stream
        writer.merge(result.toUIMessageStream());
        
        // After streaming completes, save to Firestore
        const fullResponse = await result.text;
        
        await addDoc(messagesRef, {
          role: 'user',
          content: userMessage,
          createdAt: new Date(),
        });
        
        await addDoc(messagesRef, {
          role: 'assistant',
          content: fullResponse,
          citations: parseCitations(fullResponse, diverseChunks),
          createdAt: new Date(),
        });
        
        // Update memory summary if needed
        const totalTokens = estimateTokens(llmMessages) + (fullResponse.length / 4);
        if (totalTokens > MEMORY_TOKEN_THRESHOLD) {
          const newSummary = await generateMemorySummary(recentMessages, fullResponse);
          await updateDoc(convRef, {
            memorySummary: newSummary,
            updatedAt: new Date(),
          });
        }
      },
    });
    
    return createUIMessageStreamResponse({ stream });
    
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to process chat' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function buildSystemPrompt(summaryLength: 'short' | 'medium' | 'long'): string {
  const lengthInstructions = {
    short: 'Provide concise answers in 2-3 sentences.',
    medium: 'Provide detailed answers in 1 paragraph (5-7 sentences).',
    long: 'Provide comprehensive answers in 3-5 paragraphs with detailed explanations.',
  };
  
  return `You are an AI research assistant helping users understand academic papers.

CITATION RULES:
- When making claims based on the provided context, ALWAYS cite sources using [S#] markers (e.g., [S1], [S2]).
- You can use multiple citations for a single claim: [S1][S3].
- If information is not in the provided sources, explicitly state that you don't have evidence.
- Never fabricate citations.

RESPONSE LENGTH:
${lengthInstructions[summaryLength]}

Be precise, clear, and always ground your responses in the provided context.`;
}

function diversifyChunks(
  chunks: RetrievedChunk[],
  maxTotal: number,
  maxPerPaper: number
): RetrievedChunk[] {
  const paperCounts: Record<string, number> = {};
  const result: RetrievedChunk[] = [];
  
  for (const chunk of chunks) {
    if (result.length >= maxTotal) break;
    
    const count = paperCounts[chunk.paperId] || 0;
    if (count < maxPerPaper) {
      result.push(chunk);
      paperCounts[chunk.paperId] = count + 1;
    }
  }
  
  return result;
}

function parseCitations(
  response: string,
  chunks: RetrievedChunk[]
): Array<{ sid: string; chunkId: string; paperId: string; title: string; pageStart: number; pageEnd: number; textSnippet: string; score: number }> {
  const citationRegex = /\[S(\d+)\]/g;
  const matches = [...response.matchAll(citationRegex)];
  const cited = new Set(matches.map(m => parseInt(m[1])));
  
  return Array.from(cited)
    .filter(num => num > 0 && num <= chunks.length)
    .map(num => chunks[num - 1]);
}

async function generateMemorySummary(
  recentMessages: any[],
  latestResponse: string
): Promise<string> {
  const conversationText = recentMessages
    .slice(0, -5) // Summarize older messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');
  
  const { text } = await generateText({
    model: openai(MODELS.CHAT),
    messages: [
      {
        role: 'system',
        content: 'Summarize the following conversation in 2-3 sentences, preserving key facts and user preferences.',
      },
      {
        role: 'user',
        content: conversationText,
      },
    ],
    temperature: 0.2,
    maxTokens: 150,
  });
  
  return text;
}

function estimateTokens(messages: any[]): number {
  // Rough estimate: ~4 chars per token
  return messages.reduce((sum, m) => sum + (m.content?.length || 0) / 4, 0);
}
```

**Tasks:**
- [x] Create `/app/api/chat/route.ts` with streaming support
- [x] Implement citation parsing logic
- [x] Implement memory summarization
- [x] Test streaming response
- [x] Test multi-turn context preservation

---

## PHASE 2: UI ENHANCEMENTS FOR RAG (Hours 4-8)

### 2.1 Enhanced Chat UI with useChat Hook & Citations
**Priority: HIGH** | **Time: 2h**

**File: `/app/paper/[paperId]/page.tsx` - Update Chat Panel**

```typescript
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { ChatMessageWithCitations } from '@/lib/types';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context'; // Your auth context
import { v4 as uuidv4 } from 'uuid';

export default function PaperPage({ params }: { params: { paperId: string } }) {
  const { user } = useAuth();
  const { paperId } = params;
  const [conversationId] = useState(() => uuidv4());
  const [summaryLength, setSummaryLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [mentionedPapers, setMentionedPapers] = useState<string[]>([paperId]);
  
  // Processing state for on-demand paper processing
  const [processingState, setProcessingState] = useState<{
    isProcessing: boolean;
    message: string;
    progress: number;
  } | null>(null);
  
  // Citation highlighting state
  const [activeCitation, setActiveCitation] = useState<string | null>(null);
  const [highlightedPage, setHighlightedPage] = useState<number | null>(null);
  
  // Vercel AI SDK useChat hook
  const { 
    messages, 
    sendMessage, 
    status, 
    error, 
    stop,
    regenerate 
  } = useChat<ChatMessageWithCitations>({
    transport: new DefaultChatTransport({ 
      api: '/api/chat',
      body: {
        userId: user?.uid,
        conversationId,
        summaryLength,
        addedPaperIds: mentionedPapers,
      },
    }),
  });
  
  // Check if paper needs processing before first message
  const ensurePaperProcessed = async () => {
    const checkResponse = await fetch(`/api/papers/${paperId}/check-processed`);
    const { isProcessed } = await checkResponse.json();
    
    if (isProcessed) return true;
    
    // Start processing with real-time progress updates
    setProcessingState({ isProcessing: true, message: 'Starting...', progress: 0 });
    
    const response = await fetch(`/api/papers/${paperId}/process`, {
      method: 'POST',
    });
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          
          if (data.error) {
            setProcessingState({ isProcessing: false, message: `Error: ${data.error}`, progress: 0 });
            alert(`Failed to process paper: ${data.error}`);
            return false;
          }
          
          if (data.done) {
            setProcessingState(null);
            return true;
          }
          
          setProcessingState({
            isProcessing: true,
            message: data.message,
            progress: data.progress,
          });
        }
      }
    }
    
    return true;
  };
  
  // Handle form submission with pre-processing check
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Ensure paper is processed first
    if (messages.length === 0) {
      const isReady = await ensurePaperProcessed();
      if (!isReady) {
        console.error('Paper processing failed');
        return;
      }
    }
    
    const formData = new FormData(e.currentTarget);
    const text = formData.get('message') as string;
    
    if (text.trim()) {
      sendMessage({ text });
      e.currentTarget.reset();
    }
  };
  
  // Handle citation hover - highlight in PDF
  const handleCitationHover = (citation: any) => {
    setActiveCitation(citation.sid);
    setHighlightedPage(citation.pageStart);
    // You can add more sophisticated PDF highlighting here
  };
  
  return (
    <div className="flex h-screen">
      {/* PDF Viewer Panel */}
      <div className="flex-1">
        {/* ... PDF rendering code ... */}
      </div>
      
      {/* Chat Panel */}
      <div className="w-96 border-l flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Chat with AI</h2>
          
          {/* Summary Length Selector */}
          <div className="mt-2 flex gap-2">
            {(['short', 'medium', 'long'] as const).map(length => (
              <button
                key={length}
                onClick={() => setSummaryLength(length)}
                className={`px-2 py-1 text-xs rounded ${
                  summaryLength === length ? 'bg-primary text-white' : 'bg-gray-200'
                }`}
              >
                {length}
              </button>
            ))}
          </div>
        </div>
        
        {/* Processing UI */}
        {processingState?.isProcessing && (
          <div className="p-4 bg-blue-50 border-b">
            <p className="text-sm font-medium">{processingState.message}</p>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${processingState.progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">{processingState.progress}%</p>
          </div>
        )}
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div 
              key={message.id} 
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`rounded-lg px-4 py-2 max-w-[85%] ${
                message.role === 'user' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted'
              }`}>
                {/* Text content with citation rendering */}
                {message.parts
                  .filter(part => part.type === 'text')
                  .map((part, idx) => {
                    // Split text by citation markers [S1], [S2], etc.
                    const textParts = part.text.split(/(\[S\d+\])/g);
                    
                    return (
                      <div key={idx} className="prose prose-sm max-w-none">
                        {textParts.map((textPart, i) => {
                          const citationMatch = textPart.match(/\[S(\d+)\]/);
                          
                          if (citationMatch) {
                            // Find corresponding citation data
                            const citationData = message.parts.find(
                              p => p.type === 'data-citation' && p.data.sid === textPart
                            );
                            
                            return (
                              <sup
                                key={i}
                                className="text-blue-600 cursor-pointer hover:underline font-semibold"
                                onMouseEnter={() => citationData && handleCitationHover(citationData.data)}
                                onMouseLeave={() => setActiveCitation(null)}
                              >
                                {textPart}
                              </sup>
                            );
                          }
                          
                          return <span key={i}>{textPart}</span>;
                        })}
                      </div>
                    );
                  })}
                
                {/* Display citations at bottom of message */}
                {message.parts.some(p => p.type === 'data-citation') && (
                  <div className="mt-3 pt-3 border-t border-gray-300">
                    <p className="text-xs font-semibold mb-2">Sources:</p>
                    <div className="space-y-1">
                      {message.parts
                        .filter(p => p.type === 'data-citation')
                        .map((part, idx) => (
                          <div 
                            key={idx} 
                            className="text-xs p-2 bg-white/50 rounded cursor-pointer hover:bg-white/80"
                            onClick={() => handleCitationHover(part.data)}
                          >
                            <span className="font-medium">[{part.data.sid}]</span> {part.data.title}
                            <span className="text-gray-500"> (p.{part.data.pageStart})</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {/* Loading indicator */}
          {(status === 'submitted' || status === 'streaming') && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2 animate-pulse">
                <span className="text-sm">AI is thinking...</span>
              </div>
            </div>
          )}
          
          {/* Error handling */}
          {error && (
            <div className="flex justify-center">
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm">
                <p className="text-red-600">Error: {error.message}</p>
                <button 
                  onClick={() => regenerate()}
                  className="mt-2 text-xs underline text-red-700"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Input Form */}
        <form onSubmit={handleSubmit} className="p-4 border-t">
          <div className="flex gap-2">
            <input
              name="message"
              placeholder="Ask about this paper..."
              className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={status !== 'ready' || processingState?.isProcessing}
            />
            <button
              type="submit"
              disabled={status !== 'ready' || processingState?.isProcessing}
              className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
            >
              {status === 'streaming' ? 'Stop' : 'Send'}
            </button>
          </div>
          
          {/* Stop button when streaming */}
          {status === 'streaming' && (
            <button
              type="button"
              onClick={stop}
              className="mt-2 w-full px-4 py-2 bg-red-500 text-white rounded-lg text-sm"
            >
              Stop Generation
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

// Add Processing UI Modal
{processingState?.isProcessing && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
      <h3 className="text-lg font-semibold mb-4">
        🔄 Preparing Paper for Chat
      </h3>
      
      <div className="space-y-4">
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out relative overflow-hidden"
            style={{ width: `${processingState.progress}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          </div>
        </div>
        
        <p className="text-sm text-gray-600 text-center">
          {processingState.message}
        </p>
        
        <p className="text-xs text-gray-500 text-center">
          {processingState.progress < 50 
            ? "⚡ This is a one-time process (~10-15 seconds)"
            : "🚀 Almost there! Future chats will be instant."}
        </p>
        
        <div className="text-xs text-blue-600 text-center font-medium">
          {processingState.progress}% Complete
        </div>
      </div>
    </div>
  </div>
)}
```

**Add to `globals.css`:**
```css
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.animate-shimmer {
  animation: shimmer 1.5s infinite;
}
```

**Tasks:**
- [ ] Update chat UI to support streaming responses
- [ ] Add on-demand processing check before first chat
- [ ] Implement slick processing UI with progress bar
- [ ] Add shimmer animation to globals.css
- [ ] Implement citation rendering with [S#] markers
- [ ] Add hover state for citations
- [ ] Style citation markers
- [ ] Test real-time streaming
- [ ] Test on-demand processing flow

---

### 2.2 PDF Highlighting on Citation Hover
**Priority: HIGH** | **Time: 2h**

```typescript
// In PaperPage component
useEffect(() => {
  if (!highlightedText || !numPages) return;
  
  // Jump to the cited page
  setPageNumber(highlightedText.page);
  
  // Highlight text in PDF using react-pdf's text layer
  const highlightPdfText = () => {
    const textLayer = document.querySelector('.react-pdf__Page__textContent');
    if (!textLayer) return;
    
    // Remove previous highlights
    document.querySelectorAll('.pdf-highlight').forEach(el => {
      el.classList.remove('pdf-highlight');
    });
    
    // Find and highlight matching text
    const textSpans = textLayer.querySelectorAll('span');
    const searchText = highlightedText.text.toLowerCase().trim();
    
    for (let span of Array.from(textSpans)) {
      const spanText = span.textContent?.toLowerCase().trim() || '';
      if (spanText.includes(searchText) || searchText.includes(spanText)) {
        span.classList.add('pdf-highlight');
      }
    }
  };
  
  // Wait for PDF to render
  setTimeout(highlightPdfText, 100);
  
}, [highlightedText, numPages]);

// Add to globals.css
.pdf-highlight {
  background-color: rgba(255, 255, 0, 0.4);
  border-radius: 2px;
  transition: background-color 0.2s;
}
```

**Tasks:**
- [ ] Implement PDF text search and highlighting
- [ ] Add page jumping on citation hover
- [ ] Style highlighted text
- [ ] Handle edge cases (text not found)
- [ ] Test with various PDF types

---

### 2.3 @Mention Paper Autocomplete
**Priority: HIGH** | **Time: 2h**

**Create: `/components/PaperMentionInput.tsx`**

```typescript
'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import Typesense from 'typesense';

interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPaperMention: (paper: Paper) => void;
  disabled?: boolean;
}

export function PaperMentionInput({ value, onChange, onPaperMention, disabled }: Props) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Paper[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  const typesenseClient = new Typesense.Client({
    nodes: [{
      host: process.env.NEXT_PUBLIC_TYPESENSE_HOST || '',
      port: parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT || '443'),
      protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || 'https',
    }],
    apiKey: process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY || '',
  });
  
  useEffect(() => {
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1 && lastAtIndex === value.length - 1) {
      // Just typed @
      setShowSuggestions(true);
      setMentionQuery('');
      searchPapers('');
    } else if (lastAtIndex !== -1 && value[lastAtIndex + 1] !== ' ') {
      // Typing after @
      const query = value.substring(lastAtIndex + 1);
      setMentionQuery(query);
      setShowSuggestions(true);
      searchPapers(query);
    } else {
      setShowSuggestions(false);
    }
  }, [value]);
  
  const searchPapers = async (query: string) => {
    try {
      const searchResults = await typesenseClient
        .collections('papers')
        .documents()
        .search({
          q: query || '*',
          query_by: 'title,authors',
          limit: 5,
        });
      
      const papers = searchResults.hits?.map((hit: any) => ({
        id: hit.document.id,
        title: hit.document.title,
        authors: hit.document.authors,
        year: hit.document.year,
      })) || [];
      
      setSuggestions(papers);
      setSelectedIndex(0);
    } catch (error) {
      console.error('Error searching papers:', error);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      if (showSuggestions) {
        e.preventDefault();
        selectPaper(suggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };
  
  const selectPaper = (paper: Paper) => {
    const lastAtIndex = value.lastIndexOf('@');
    const newValue = value.substring(0, lastAtIndex) + `@${paper.title} `;
    onChange(newValue);
    onPaperMention(paper);
    setShowSuggestions(false);
  };
  
  return (
    <div className="relative w-full">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Ask about this paper... (use @ to mention other papers)"
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 w-full mb-2 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto z-50">
          {suggestions.map((paper, index) => (
            <div
              key={paper.id}
              className={`px-3 py-2 cursor-pointer hover:bg-accent ${
                index === selectedIndex ? 'bg-accent' : ''
              }`}
              onClick={() => selectPaper(paper)}
            >
              <div className="font-medium text-sm truncate">{paper.title}</div>
              <div className="text-xs text-muted-foreground">
                {paper.authors.slice(0, 2).join(', ')} ({paper.year})
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Tasks:**
- [ ] Create PaperMentionInput component
- [ ] Integrate with Typesense for autocomplete
- [ ] Implement keyboard navigation (Tab, Arrow keys)
- [ ] Style suggestion dropdown
- [ ] Track mentioned papers in conversation state
- [ ] Test autocomplete performance

---

### 2.4 Summary Length Selector
**Priority: MEDIUM** | **Time: 30min**

```typescript
// Add to chat panel
<div className="flex items-center gap-2 p-2 border-b">
  <span className="text-sm text-muted-foreground">Summary length:</span>
  <Button
    variant={summaryLength === 'short' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setSummaryLength('short')}
  >
    Short
  </Button>
  <Button
    variant={summaryLength === 'medium' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setSummaryLength('medium')}
  >
    Medium
  </Button>
  <Button
    variant={summaryLength === 'long' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setSummaryLength('long')}
  >
    Long
  </Button>
</div>
```

**Tasks:**
- [ ] Add summary length selector UI
- [ ] Pass summaryLength to chat API
- [ ] Test different summary lengths
- [ ] Persist user preference

---

## PHASE 3: SOCIAL FEATURES (Hours 8-14)

### 3.1 User Profiles & Following System
**Priority: HIGH** | **Time: 2h**

**Create: `/app/profile/[userId]/page.tsx`**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { db, auth } from '@/lib/firebaseConfig';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function ProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const currentUser = auth.currentUser;
  
  const [profile, setProfile] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadProfile();
  }, [userId]);
  
  const loadProfile = async () => {
    const profileDoc = await getDoc(doc(db, `users/${userId}/profile`));
    setProfile(profileDoc.data());
    
    if (currentUser) {
      const currentUserProfile = await getDoc(doc(db, `users/${currentUser.uid}/profile`));
      const following = currentUserProfile.data()?.following || [];
      setIsFollowing(following.includes(userId));
    }
    
    setLoading(false);
  };
  
  const toggleFollow = async () => {
    if (!currentUser) return;
    
    const currentUserRef = doc(db, `users/${currentUser.uid}/profile`);
    const targetUserRef = doc(db, `users/${userId}/profile`);
    
    if (isFollowing) {
      await updateDoc(currentUserRef, {
        following: arrayRemove(userId),
      });
      await updateDoc(targetUserRef, {
        followers: arrayRemove(currentUser.uid),
      });
      setIsFollowing(false);
    } else {
      await updateDoc(currentUserRef, {
        following: arrayUnion(userId),
      });
      await updateDoc(targetUserRef, {
        followers: arrayUnion(currentUser.uid),
      });
      setIsFollowing(true);
    }
  };
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div className="container mx-auto p-6">
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{profile?.displayName}</h1>
            <p className="text-muted-foreground">{profile?.email}</p>
            {profile?.bio && <p className="mt-2">{profile.bio}</p>}
            
            <div className="flex gap-4 mt-4">
              <div>
                <span className="font-semibold">{profile?.followers?.length || 0}</span>
                <span className="text-muted-foreground ml-1">Followers</span>
              </div>
              <div>
                <span className="font-semibold">{profile?.following?.length || 0}</span>
                <span className="text-muted-foreground ml-1">Following</span>
              </div>
            </div>
          </div>
          
          {currentUser && currentUser.uid !== userId && (
            <Button onClick={toggleFollow}>
              {isFollowing ? 'Unfollow' : 'Follow'}
            </Button>
          )}
        </div>
      </Card>
      
      {/* User's recent activity, library, etc. */}
    </div>
  );
}
```

**Create: `/app/api/users/[userId]/route.ts`**

**Tasks:**
- [ ] Create user profile page
- [ ] Implement follow/unfollow functionality
- [ ] Create profile edit page
- [ ] Add profile creation on first login
- [ ] Test follow system

---

### 3.2 Paper Ratings System
**Priority: HIGH** | **Time: 1.5h**

**Create: `/components/PaperRating.tsx`**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebaseConfig';
import { doc, setDoc, getDoc, collection, query, getDocs } from 'firebase/firestore';
import { Star } from 'lucide-react';

interface Props {
  paperId: string;
}

export function PaperRating({ paperId }: Props) {
  const [userRating, setUserRating] = useState<number>(0);
  const [averageRating, setAverageRating] = useState<number>(0);
  const [ratingCount, setRatingCount] = useState<number>(0);
  const [hoveredStar, setHoveredStar] = useState<number>(0);
  const currentUser = auth.currentUser;
  
  useEffect(() => {
    loadRatings();
  }, [paperId]);
  
  const loadRatings = async () => {
    // Load user's rating
    if (currentUser) {
      const userRatingDoc = await getDoc(
        doc(db, `papers/${paperId}/ratings/${currentUser.uid}`)
      );
      if (userRatingDoc.exists()) {
        setUserRating(userRatingDoc.data().rating);
      }
    }
    
    // Load average rating
    const ratingsSnapshot = await getDocs(
      collection(db, `papers/${paperId}/ratings`)
    );
    
    if (!ratingsSnapshot.empty) {
      const ratings = ratingsSnapshot.docs.map(d => d.data().rating);
      const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      setAverageRating(avg);
      setRatingCount(ratings.length);
    }
  };
  
  const handleRating = async (rating: number) => {
    if (!currentUser) {
      alert('Please log in to rate papers');
      return;
    }
    
    await setDoc(doc(db, `papers/${paperId}/ratings/${currentUser.uid}`), {
      userId: currentUser.uid,
      rating,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    setUserRating(rating);
    await loadRatings(); // Refresh average
  };
  
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`w-6 h-6 cursor-pointer transition-colors ${
                (hoveredStar || userRating) >= star
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-gray-300'
              }`}
              onMouseEnter={() => setHoveredStar(star)}
              onMouseLeave={() => setHoveredStar(0)}
              onClick={() => handleRating(star)}
            />
          ))}
        </div>
        {userRating > 0 && (
          <span className="text-sm text-muted-foreground">
            Your rating: {userRating}
          </span>
        )}
      </div>
      
      {ratingCount > 0 && (
        <div className="text-sm text-muted-foreground">
          Average: {averageRating.toFixed(1)} ({ratingCount} {ratingCount === 1 ? 'rating' : 'ratings'})
        </div>
      )}
    </div>
  );
}
```

**Tasks:**
- [ ] Create PaperRating component
- [ ] Add rating to paper detail page
- [ ] Add average rating to paper cards on home page
- [ ] Create API route to fetch ratings
- [ ] Test rating functionality

---

### 3.3 Threaded Comments System
**Priority: HIGH** | **Time: 2h**

**Create: `/components/CommentSection.tsx`**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebaseConfig';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowBigUp, ArrowBigDown, MessageSquare } from 'lucide-react';

interface Comment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  parentId?: string;
  upvotes: number;
  downvotes: number;
  votedBy: Record<string, 'up' | 'down'>;
  createdAt: any;
  replies?: Comment[];
}

interface Props {
  paperId: string;
}

export function CommentSection({ paperId }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUser = auth.currentUser;
  
  useEffect(() => {
    loadComments();
  }, [paperId]);
  
  const loadComments = async () => {
    const commentsQuery = query(
      collection(db, `papers/${paperId}/comments`),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(commentsQuery);
    const allComments = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
    })) as Comment[];
    
    // Build threaded structure
    const topLevel = allComments.filter(c => !c.parentId);
    const threaded = topLevel.map(comment => ({
      ...comment,
      replies: allComments.filter(c => c.parentId === comment.id),
    }));
    
    setComments(threaded);
    setLoading(false);
  };
  
  const handleSubmitComment = async (parentId?: string) => {
    if (!currentUser || !newComment.trim()) return;
    
    const userProfile = await getDoc(doc(db, `users/${currentUser.uid}/profile`));
    const userName = userProfile.data()?.displayName || currentUser.email || 'Anonymous';
    
    await addDoc(collection(db, `papers/${paperId}/comments`), {
      userId: currentUser.uid,
      userName,
      content: newComment,
      parentId: parentId || null,
      upvotes: 0,
      downvotes: 0,
      votedBy: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    setNewComment('');
    setReplyingTo(null);
    await loadComments();
  };
  
  const handleVote = async (commentId: string, voteType: 'up' | 'down') => {
    if (!currentUser) {
      alert('Please log in to vote');
      return;
    }
    
    const commentRef = doc(db, `papers/${paperId}/comments/${commentId}`);
    const commentDoc = await getDoc(commentRef);
    const commentData = commentDoc.data();
    
    if (!commentData) return;
    
    const currentVote = commentData.votedBy?.[currentUser.uid];
    const updates: any = {};
    
    if (currentVote === voteType) {
      // Remove vote
      updates[voteType === 'up' ? 'upvotes' : 'downvotes'] = increment(-1);
      updates[`votedBy.${currentUser.uid}`] = null;
    } else {
      // Add/change vote
      if (currentVote) {
        updates[currentVote === 'up' ? 'upvotes' : 'downvotes'] = increment(-1);
      }
      updates[voteType === 'up' ? 'upvotes' : 'downvotes'] = increment(1);
      updates[`votedBy.${currentUser.uid}`] = voteType;
    }
    
    await updateDoc(commentRef, updates);
    await loadComments();
  };
  
  const renderComment = (comment: Comment, isReply = false) => (
    <div key={comment.id} className={`${isReply ? 'ml-8 mt-2' : 'mt-4'} border-l-2 pl-4`}>
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center">
          <button
            onClick={() => handleVote(comment.id, 'up')}
            className={`${
              comment.votedBy?.[currentUser?.uid || ''] === 'up'
                ? 'text-orange-500'
                : 'text-gray-400'
            } hover:text-orange-500`}
          >
            <ArrowBigUp className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium">
            {comment.upvotes - comment.downvotes}
          </span>
          <button
            onClick={() => handleVote(comment.id, 'down')}
            className={`${
              comment.votedBy?.[currentUser?.uid || ''] === 'down'
                ? 'text-blue-500'
                : 'text-gray-400'
            } hover:text-blue-500`}
          >
            <ArrowBigDown className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">{comment.userName}</span>
            <span className="text-muted-foreground">
              {new Date(comment.createdAt.toDate()).toLocaleDateString()}
            </span>
          </div>
          <p className="mt-1 text-sm">{comment.content}</p>
          
          <button
            onClick={() => setReplyingTo(comment.id)}
            className="mt-2 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <MessageSquare className="w-4 h-4" />
            Reply
          </button>
          
          {replyingTo === comment.id && (
            <div className="mt-2">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a reply..."
                className="mb-2"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleSubmitComment(comment.id)}>
                  Submit Reply
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setReplyingTo(null);
                    setNewComment('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-2">
              {comment.replies.map(reply => renderComment(reply, true))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
  
  return (
    <div className="mt-6">
      <h2 className="text-xl font-semibold mb-4">Comments</h2>
      
      {currentUser ? (
        <div className="mb-6">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            className="mb-2"
          />
          <Button onClick={() => handleSubmitComment()}>Post Comment</Button>
        </div>
      ) : (
        <p className="mb-6 text-muted-foreground">Log in to comment</p>
      )}
      
      {loading ? (
        <p>Loading comments...</p>
      ) : comments.length > 0 ? (
        comments.map(comment => renderComment(comment))
      ) : (
        <p className="text-muted-foreground">No comments yet. Be the first to comment!</p>
      )}
    </div>
  );
}
```

**Tasks:**
- [ ] Create CommentSection component
- [ ] Add to paper detail page
- [ ] Implement threaded replies
- [ ] Implement upvote/downvote
- [ ] Test comment threading
- [ ] Add comment count to paper cards

---

### 3.4 Activity Feed & Personal Feed
**Priority: MEDIUM** | **Time: 2h**

**Create: `/app/api/feed/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseConfig';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId');
  
  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }
  
  try {
    // Get user's following list
    const userProfile = await getDoc(doc(db, `users/${userId}/profile`));
    const following = userProfile.data()?.following || [];
    const favoriteCategories = userProfile.data()?.favoriteCategories || [];
    
    // Get reading history for recommendations
    const libraryQuery = query(
      collection(db, `users/${userId}/library`),
      orderBy('lastRead', 'desc'),
      limit(10)
    );
    const librarySnapshot = await getDocs(libraryQuery);
    const recentPaperIds = librarySnapshot.docs.map(d => d.data().paperId);
    
    // Get feed events from followed users
    let feedEvents: any[] = [];
    if (following.length > 0) {
      const feedQuery = query(
        collection(db, 'feed_events'),
        where('userId', 'in', following.slice(0, 10)), // Firestore limit: 10 items in 'in' query
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const feedSnapshot = await getDocs(feedQuery);
      feedEvents = feedSnapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        source: 'following',
      }));
    }
    
    // TODO: Get recommended papers based on reading history
    // This would use Qdrant to find similar papers
    
    // TODO: Get papers from favorite categories (use Typesense)
    
    return NextResponse.json({
      feedEvents,
      // recommendations: [],
      // categoryPapers: [],
    });
    
  } catch (error: any) {
    console.error('Feed API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load feed' },
      { status: 500 }
    );
  }
}
```

**Create: `/components/ActivityFeed.tsx`**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

interface FeedEvent {
  id: string;
  userId: string;
  userName: string;
  eventType: 'read' | 'rated' | 'commented' | 'uploaded';
  paperId: string;
  paperTitle: string;
  metadata?: any;
  createdAt: any;
}

export function ActivityFeed({ userId }: { userId: string }) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadFeed();
  }, [userId]);
  
  const loadFeed = async () => {
    const response = await fetch(`/api/feed?userId=${userId}`);
    const data = await response.json();
    setEvents(data.feedEvents || []);
    setLoading(false);
  };
  
  const getEventDescription = (event: FeedEvent) => {
    switch (event.eventType) {
      case 'read':
        return 'is reading';
      case 'rated':
        return `rated ${event.metadata?.rating}/5`;
      case 'commented':
        return 'commented on';
      case 'uploaded':
        return 'uploaded';
      default:
        return 'interacted with';
    }
  };
  
  if (loading) return <div>Loading feed...</div>;
  
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Activity Feed</h2>
      {events.length > 0 ? (
        events.map(event => (
          <Card key={event.id} className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm">
                  <Link href={`/profile/${event.userId}`} className="font-semibold hover:underline">
                    {event.userName}
                  </Link>
                  {' '}{getEventDescription(event)}{' '}
                  <Link href={`/paper/${event.paperId}`} className="text-blue-600 hover:underline">
                    {event.paperTitle}
                  </Link>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(event.createdAt.toDate()).toLocaleString()}
                </p>
              </div>
            </div>
          </Card>
        ))
      ) : (
        <p className="text-muted-foreground">No activity yet. Follow users to see their activity!</p>
      )}
    </div>
  );
}
```

**Tasks:**
- [ ] Create feed API route
- [ ] Create ActivityFeed component
- [ ] Add feed to home page
- [ ] Track user actions (read, rate, comment) to feed_events
- [ ] Test feed with multiple users

---

## PHASE 4: USER LIBRARY & PDF UPLOAD (Hours 14-17)

### 4.1 User Library/History Page
**Priority: MEDIUM** | **Time: 1.5h**

**Create: `/app/library/page.tsx`**

```typescript
'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebaseConfig';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';

export default function LibraryPage() {
  const [library, setLibrary] = useState<any[]>([]);
  const [uploads, setUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const currentUser = auth.currentUser;
  
  useEffect(() => {
    if (currentUser) {
      loadLibrary();
    }
  }, [currentUser]);
  
  const loadLibrary = async () => {
    if (!currentUser) return;
    
    // Load reading history
    const libraryQuery = query(
      collection(db, `users/${currentUser.uid}/library`),
      orderBy('lastRead', 'desc')
    );
    const librarySnapshot = await getDocs(libraryQuery);
    setLibrary(librarySnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    
    // Load uploads
    const uploadsQuery = query(
      collection(db, `users/${currentUser.uid}/uploads`),
      orderBy('uploadedAt', 'desc')
    );
    const uploadsSnapshot = await getDocs(uploadsQuery);
    setUploads(uploadsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    
    setLoading(false);
  };
  
  if (!currentUser) {
    return <div className="p-6">Please log in to view your library.</div>;
  }
  
  if (loading) return <div className="p-6">Loading library...</div>;
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">My Library</h1>
      
      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">Reading History</TabsTrigger>
          <TabsTrigger value="uploads">My Uploads</TabsTrigger>
        </TabsList>
        
        <TabsContent value="history" className="mt-6">
          {library.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {library.map(item => (
                <Link key={item.id} href={`/paper/${item.paperId}`}>
                  <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                    <CardHeader>
                      <CardTitle className="text-lg">{item.paperId}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground">
                        Last read: {new Date(item.lastRead.toDate()).toLocaleDateString()}
                      </div>
                      {item.personalRating && (
                        <div className="text-sm mt-2">
                          Your rating: {item.personalRating}/5
                        </div>
                      )}
                      {item.readingProgress > 0 && (
                        <div className="mt-2">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${item.readingProgress}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {item.readingProgress}% complete
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No reading history yet.</p>
          )}
        </TabsContent>
        
        <TabsContent value="uploads" className="mt-6">
          {uploads.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uploads.map(upload => (
                <Link key={upload.id} href={`/paper/${upload.id}`}>
                  <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                    <CardHeader>
                      <CardTitle className="text-lg">{upload.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground">
                        {upload.authors.join(', ')}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Uploaded: {new Date(upload.uploadedAt.toDate()).toLocaleDateString()}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No uploads yet.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Tasks:**
- [ ] Create library page
- [ ] Add Tabs component from shadcn/ui: `npx shadcn@latest add tabs`
- [ ] Display reading history
- [ ] Display user uploads
- [ ] Add reading progress tracking
- [ ] Link to library from navbar

---

### 4.2 PDF Upload Feature
**Priority: MEDIUM** | **Time: 1.5h**

**Setup Firebase Storage:**
```bash
npm install firebase
```

**Create: `/app/upload/page.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebaseConfig'; // Add storage export
import { collection, addDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [year, setYear] = useState('');
  const [abstract, setAbstract] = useState('');
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const currentUser = auth.currentUser;
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === 'application/pdf') {
        setFile(selectedFile);
      } else {
        alert('Please select a PDF file');
      }
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !file) return;
    
    setUploading(true);
    
    try {
      // Upload PDF to Firebase Storage
      const fileRef = ref(storage, `uploads/${currentUser.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const pdfUrl = await getDownloadURL(fileRef);
      
      // Save metadata to Firestore
      const uploadDoc = await addDoc(
        collection(db, `users/${currentUser.uid}/uploads`),
        {
          fileName: file.name,
          title,
          authors: authors.split(',').map(a => a.trim()),
          year: year ? parseInt(year) : null,
          abstract,
          pdfUrl,
          uploadedAt: new Date(),
          fileSize: file.size,
        }
      );
      
      alert('Upload successful!');
      router.push(`/paper/${uploadDoc.id}`);
      
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };
  
  if (!currentUser) {
    return <div className="p-6">Please log in to upload papers.</div>;
  }
  
  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Upload Paper</h1>
      
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="file">PDF File *</Label>
            <Input
              id="file"
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="authors">Authors (comma-separated) *</Label>
            <Input
              id="authors"
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              placeholder="John Doe, Jane Smith"
              required
            />
          </div>
          
          <div>
            <Label htmlFor="year">Year</Label>
            <Input
              id="year"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2024"
            />
          </div>
          
          <div>
            <Label htmlFor="abstract">Abstract</Label>
            <Textarea
              id="abstract"
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              rows={6}
            />
          </div>
          
          <Button type="submit" disabled={uploading || !file}>
            {uploading ? 'Uploading...' : 'Upload Paper'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

**Update `/lib/firebaseConfig.ts` to export storage:**

```typescript
import { getStorage } from 'firebase/storage';

export const storage = getStorage(app);
```

**Tasks:**
- [ ] Add Firebase Storage to project
- [ ] Create upload page
- [ ] Add Textarea component: `npx shadcn@latest add textarea`
- [ ] Handle file upload to Firebase Storage
- [ ] Save upload metadata to Firestore
- [ ] Test upload with sample PDF
- [ ] Add upload link to navbar
- [ ] Handle uploaded papers in paper detail page

---

## PHASE 5: ADDITIONAL FEATURES (Hours 17-22)

### 5.1 Note-Taking Feature
**Priority: MEDIUM** | **Time: 1.5h**

**Add to `/app/paper/[paperId]/page.tsx`:**

```typescript
// Add to state
const [notes, setNotes] = useState('');
const [savedNotes, setSavedNotes] = useState('');
const [savingNotes, setSavingNotes] = useState(false);

// Load notes
useEffect(() => {
  loadNotes();
}, [paperId, currentUser]);

const loadNotes = async () => {
  if (!currentUser) return;
  
  const libraryDoc = await getDoc(
    doc(db, `users/${currentUser.uid}/library/${paperId}`)
  );
  
  if (libraryDoc.exists()) {
    setSavedNotes(libraryDoc.data().personalNotes || '');
    setNotes(libraryDoc.data().personalNotes || '');
  }
};

const saveNotes = async () => {
  if (!currentUser) return;
  
  setSavingNotes(true);
  
  try {
    await setDoc(
      doc(db, `users/${currentUser.uid}/library/${paperId}`),
      {
        paperId,
        personalNotes: notes,
        lastRead: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );
    
    setSavedNotes(notes);
    alert('Notes saved!');
  } catch (error) {
    console.error('Error saving notes:', error);
    alert('Failed to save notes');
  } finally {
    setSavingNotes(false);
  }
};

// Add to UI (new panel or section)
<div className="p-4 border-t">
  <div className="flex items-center justify-between mb-2">
    <h3 className="font-semibold">Personal Notes</h3>
    <div className="flex gap-2">
      <Button
        size="sm"
        onClick={saveNotes}
        disabled={savingNotes || notes === savedNotes}
      >
        {savingNotes ? 'Saving...' : 'Save Notes'}
      </Button>
    </div>
  </div>
  <Textarea
    value={notes}
    onChange={(e) => setNotes(e.target.value)}
    placeholder="Take notes about this paper..."
    className="min-h-[200px]"
  />
</div>
```

**Tasks:**
- [ ] Add notes section to paper page
- [ ] Implement auto-save or manual save
- [ ] Show unsaved changes indicator
- [ ] Test notes persistence

---

### 5.2 Similar Papers Recommendation
**Priority: MEDIUM** | **Time: 1.5h**

**Create: `/app/api/papers/[paperId]/similar/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { qdrant } from '@/lib/qdrant-client';
import { generateEmbedding } from '@/lib/openai-client';

export async function GET(
  request: NextRequest,
  { params }: { params: { paperId: string } }
) {
  try {
    const paperId = params.paperId;
    
    // Get paper chunks to create a representative embedding
    const paperChunks = await qdrant.scroll('paper_chunks', {
      filter: {
        must: [{
          key: 'paperId',
          match: { value: paperId }
        }]
      },
      limit: 5,
      with_payload: true,
      with_vector: true,
    });
    
    if (!paperChunks.points || paperChunks.points.length === 0) {
      return NextResponse.json({ similar: [] });
    }
    
    // Average the vectors to get a representative embedding
    const avgVector = averageVectors(
      paperChunks.points.map(p => p.vector as number[])
    );
    
    // Search for similar papers
    const similarResults = await qdrant.search('paper_chunks', {
      vector: avgVector,
      limit: 50,
      with_payload: true,
    });
    
    // Group by paper and get top 5
    const paperScores: Record<string, { paper: any; score: number; count: number }> = {};
    
    for (const result of similarResults) {
      const pid = result.payload.paperId as string;
      if (pid === paperId) continue; // Skip current paper
      
      if (!paperScores[pid]) {
        paperScores[pid] = {
          paper: {
            id: pid,
            title: result.payload.title,
            authors: result.payload.authors,
            year: result.payload.year,
          },
          score: 0,
          count: 0,
        };
      }
      
      paperScores[pid].score += result.score;
      paperScores[pid].count += 1;
    }
    
    // Sort by average score
    const similarPapers = Object.values(paperScores)
      .map(p => ({
        ...p.paper,
        avgScore: p.score / p.count,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5);
    
    return NextResponse.json({ similar: similarPapers });
    
  } catch (error: any) {
    console.error('Similar papers error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

function averageVectors(vectors: number[][]): number[] {
  const dim = vectors[0].length;
  const avg = new Array(dim).fill(0);
  
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      avg[i] += vec[i];
    }
  }
  
  return avg.map(v => v / vectors.length);
}
```

**Add to paper detail page:**

```typescript
const [similarPapers, setSimilarPapers] = useState<any[]>([]);

useEffect(() => {
  loadSimilarPapers();
}, [paperId]);

const loadSimilarPapers = async () => {
  const response = await fetch(`/api/papers/${paperId}/similar`);
  const data = await response.json();
  setSimilarPapers(data.similar || []);
};

// Add UI section
<div className="mt-6">
  <h2 className="text-xl font-semibold mb-4">Similar Papers</h2>
  <div className="grid gap-3">
    {similarPapers.map(paper => (
      <Link key={paper.id} href={`/paper/${paper.id}`}>
        <Card className="p-3 hover:shadow-md transition-shadow cursor-pointer">
          <h3 className="font-medium text-sm">{paper.title}</h3>
          <p className="text-xs text-muted-foreground">
            {paper.authors?.slice(0, 2).join(', ')} ({paper.year})
          </p>
        </Card>
      </Link>
    ))}
  </div>
</div>
```

**Tasks:**
- [ ] Create similar papers API route
- [ ] Add similar papers section to paper page
- [ ] Test recommendations
- [ ] Optimize vector averaging

---

### 5.3 Text-to-Speech for Papers
**Priority: LOW** | **Time: 1h**

```typescript
// Add to paper detail page
const [isReading, setIsReading] = useState(false);
const [speechSynth] = useState(
  typeof window !== 'undefined' ? window.speechSynthesis : null
);

const toggleTextToSpeech = () => {
  if (!speechSynth) return;
  
  if (isReading) {
    speechSynth.cancel();
    setIsReading(false);
  } else {
    // Get text from current PDF page
    const textLayer = document.querySelector('.react-pdf__Page__textContent');
    if (textLayer) {
      const text = textLayer.textContent || '';
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setIsReading(false);
      speechSynth.speak(utterance);
      setIsReading(true);
    }
  }
};

// Add button to PDF controls
<Button onClick={toggleTextToSpeech} size="sm" variant="outline">
  {isReading ? 'Stop Reading' : 'Read Aloud'}
</Button>
```

**Tasks:**
- [ ] Add text-to-speech button
- [ ] Implement using Web Speech API
- [ ] Handle page navigation during reading
- [ ] Add voice/speed controls (optional)

---

### 5.4 Paper Citations/References Display
**Priority: MEDIUM** | **Time: 1h**

**Note:** This requires parsing PDF metadata or using external APIs.

**Simple implementation:**

```typescript
// Add to paper metadata
interface PaperMetadata {
  // ... existing fields
  citations?: Array<{
    title: string;
    authors: string[];
    year: number;
    paperId?: string; // If in our system
  }>;
  references?: Array<{
    title: string;
    authors: string[];
    year: number;
    paperId?: string;
  }>;
}

// Add UI section
<div className="mt-6">
  <h2 className="text-xl font-semibold mb-4">References</h2>
  {metadata.references && metadata.references.length > 0 ? (
    <ol className="list-decimal list-inside space-y-2">
      {metadata.references.map((ref, i) => (
        <li key={i} className="text-sm">
          {ref.title} - {ref.authors.join(', ')} ({ref.year})
          {ref.paperId && (
            <Link href={`/paper/${ref.paperId}`} className="ml-2 text-blue-600">
              View in SocialArxiv
            </Link>
          )}
        </li>
      ))}
    </ol>
  ) : (
    <p className="text-muted-foreground">No references available</p>
  )}
</div>
```

**Tasks:**
- [ ] Add references section to paper page
- [ ] Parse references from PDF metadata (if available)
- [ ] Link to papers in system
- [ ] Display citation count

---

## PHASE 6: DEPLOYMENT & DEMO PREPARATION (Hours 22-24)

### 6.1 Demo Preparation Checklist
**Priority: CRITICAL** | **Time: 30min**

**Pre-Demo Setup (Night Before):**

```bash
# 1. Sync metadata for 10,000+ papers (30 minutes)
npm run sync-metadata

# 2. Pre-load 500-1000 popular papers (2-3 hours - RUN OVERNIGHT!)
npm run preload-demo

# This gives you:
# ✅ 10,000+ papers searchable instantly
# ✅ 500-1000 papers ready for instant RAG chat
# ✅ Remaining papers process on-demand in 10-15 seconds
```

**Morning of Demo:**

```bash
# 3. Verify services are running
npm run dev

# 4. Test critical flows:
# - Search for a pre-loaded paper (e.g., "GPT-4") → Instant
# - Open paper → PDF loads
# - Ask question → Chat responds INSTANTLY (pre-loaded)
# - Search for rare paper → On-demand processing works (~15 sec)

# 5. Prepare demo script with likely papers:
# - "Attention Is All You Need" (Transformer)
# - "GPT-3" or "GPT-4"
# - "BERT"
# - "CLIP"
# All guaranteed to be pre-loaded and instant!
```

**Demo Flow Script:**

```
🎬 INTERACTIVE DEMO (8-10 minutes):

[0:00-1:00] Introduction
"We built SocialArxiv - an AI-powered research platform with 10,000+ papers"

[1:00-2:00] Audience Interaction
"What paper would you like to see?"
- Audience suggests a paper (e.g., "GPT-4", "Transformer", "BERT")
- Search for it
- Results appear instantly

[2:00-3:00] Open Paper
- Click paper
- PDF loads instantly
- Scroll through pages

[3:00-5:00] RAG Chat (THE HIGHLIGHT)
"Let me ask the AI about this paper..."
- Type: "What is the main contribution of this paper?"
- ✅ INSTANT response (if pre-loaded - 80-90% chance!)
- OR: Show slick 10-15 sec processing UI (looks professional!)
- Show citation highlighting
- Hover over [S1] → PDF highlights the source

[5:00-6:00] Multi-Paper Chat
"Anyone want to suggest another paper to compare?"
- Audience suggests another paper
- Type: "@" and search for paper name
- Autocomplete appears
- Select paper
- Ask: "How do these papers differ?"
- ✅ Get multi-paper answer with citations

[6:00-7:00] Social Features
"Users can also interact with the community"
- Show threaded comments
- Show star ratings
- Show user following

[7:00-8:00] User Features
- Personal library
- Reading history
- Notes

[8:00-9:00] Q&A
```

**Tasks:**
- [ ] Run metadata sync (30 min)
- [ ] Run preload script overnight (2-3 hours)
- [ ] Create demo script with backup papers
- [ ] Test 5-10 random papers to verify instant chat
- [ ] Prepare list of "guaranteed instant" papers for demo
- [ ] Test on-demand processing with rare paper

---

### 6.2 Add Featured/Pre-loaded Papers Section to Home Page
**Priority: MEDIUM** | **Time: 30min**

**Update `/app/page.tsx`:**

```typescript
// Add featured papers section at top of search results
const FEATURED_PAPERS_IDS = [
  '2010.11929', // GPT-3
  '1706.03762', // Attention Is All You Need
  '2303.08774', // GPT-4
  '1810.04805', // BERT
  '2103.00020', // CLIP
  '2001.08361', // Vision Transformer
];

const [featuredPapers, setFeaturedPapers] = useState<PaperDocument[]>([]);

useEffect(() => {
  loadFeaturedPapers();
}, []);

const loadFeaturedPapers = async () => {
  try {
    const papers = await Promise.all(
      FEATURED_PAPERS_IDS.map(async (id) => {
        const response = await fetch(`/api/papers/${id}`);
        return response.json();
      })
    );
    setFeaturedPapers(papers.filter(p => p !== null));
  } catch (error) {
    console.error('Error loading featured papers:', error);
  }
};

// Add to UI before main search results
<div className="mb-8">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-xl font-semibold">
      Featured Papers
    </h2>
    <span className="text-sm text-green-600 flex items-center gap-1">
      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
      Pre-loaded for instant chat
    </span>
  </div>
  
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {featuredPapers.map((paper) => (
      <Link href={`/paper/${paper.id}`} key={paper.id}>
        <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-2 border-green-500/30 bg-green-50/30">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-lg line-clamp-2">{paper.title}</CardTitle>
              <span className="text-xs bg-green-600 text-white px-2 py-1 rounded-full whitespace-nowrap">
                ⚡ Instant
              </span>
            </div>
            <CardDescription className="text-xs">
              {(Array.isArray(paper.authors) ? paper.authors.slice(0, 2).join(', ') : paper.authors) || 'Unknown Authors'} - {paper.year || 'N/A'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground line-clamp-3">
              {paper.abstract || 'No abstract available.'}
            </p>
          </CardContent>
        </Card>
      </Link>
    ))}
  </div>
</div>

<div className="border-t pt-8 mt-8">
  <h2 className="text-xl font-semibold mb-4">All Papers</h2>
  {/* Existing search results grid */}
</div>
```

**Tasks:**
- [ ] Add featured papers section to home page
- [ ] Style with visual indicator (green badge)
- [ ] Load featured papers on mount
- [ ] Test featured papers are pre-loaded

---

### 6.3 Package.json Scripts
**Priority: CRITICAL** | **Time: 5min**

**Update `package.json`:**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    
    "sync-metadata": "node scripts/sync-arxiv-metadata.mjs",
    "preload-demo": "node scripts/preload-demo-papers.mjs",
    "demo-ready": "npm run sync-metadata && npm run preload-demo",
    
    "ingest": "node scripts/ingest.mjs"
  }
}
```

**Tasks:**
- [ ] Add all scripts to package.json
- [ ] Test each script runs correctly
- [ ] Document usage in README

---

### 6.4 Environment Variables & Secrets
**Priority: CRITICAL** | **Time: 15min**

**Verify `.env.local` has all required variables:**

```env
# Typesense
NEXT_PUBLIC_TYPESENSE_HOST=
NEXT_PUBLIC_TYPESENSE_PORT=443
NEXT_PUBLIC_TYPESENSE_PROTOCOL=https
NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY=
TYPESENSE_ADMIN_API_KEY=

# Qdrant
QDRANT_URL=
QDRANT_API_KEY=

# OpenAI (NEW - REQUIRED!)
OPENAI_API_KEY=

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

**For Vercel deployment:**

```bash
# Add all env vars to Vercel
vercel env add NEXT_PUBLIC_TYPESENSE_HOST
vercel env add TYPESENSE_ADMIN_API_KEY
# ... repeat for all variables
```

**Tasks:**
- [ ] Verify all environment variables
- [ ] Add to Vercel project settings
- [ ] Test in production build locally
- [ ] Document required variables in README

---

### 6.5 Final Testing & Deployment
**Priority: CRITICAL** | **Time: 1h**

**Pre-deployment checklist:**

```bash
# 1. Build locally
npm run build

# 2. Check for errors
npm run lint

# 3. Test critical flows:
# ✅ User registration/login
# ✅ Paper search (10,000+ papers)
# ✅ Featured papers show "Instant" badge
# ✅ PDF viewing
# ✅ Chat with PRE-LOADED paper (instant!)
# ✅ Chat with NON-preloaded paper (15-sec processing, then works)
# ✅ Multi-turn chat with citations
# ✅ @mention papers autocomplete
# ✅ Citation hover → PDF highlights
# ✅ Comments and ratings
# ✅ Follow users
# ✅ Upload PDF
```

**Post-Deployment Verification:**

```bash
# Test production URLs:
# 1. https://your-app.vercel.app → Home page loads
# 2. Search works
# 3. Featured papers show correctly
# 4. Open a featured paper → Chat instantly
# 5. Open a random paper → On-demand processing works
```

**Tasks:**
- [ ] Run build locally and fix errors
- [ ] Fix any TypeScript errors
- [ ] Test all critical features locally
- [ ] Add all env vars to Vercel
- [ ] Deploy to Vercel production
- [ ] Test production deployment thoroughly
- [ ] Monitor for errors in Vercel logs
- [ ] Create demo user account with sample data
- [ ] Test demo flow end-to-end on production

---

## FINAL PRIORITY SUMMARY

### Pre-Demo Setup (Night Before):
**Run these scripts and go to bed!**
1. ✅ `npm run sync-metadata` - Index 10,000+ papers (30 min)
2. ✅ `npm run preload-demo` - Pre-process 500-1000 papers (2-3 hours)

**Result: ~80-90% of demo requests will be instant!**

### Must-Have (Complete First - Hours 0-14):
1. ✅ On-demand processing API with progress UI (PHASE 0-1)
2. ✅ Multi-turn RAG with citations (PHASE 1-2)
3. ✅ @mention paper autocomplete
4. ✅ Citation hover highlighting
5. ✅ User profiles & following
6. ✅ Paper ratings
7. ✅ Threaded comments
8. ✅ Activity feed

### Should-Have (If Time - Hours 14-20):
9. ✅ User library
10. ✅ PDF upload
11. ✅ Note-taking
12. ✅ Similar papers

### Nice-to-Have (Polish - Hours 20-24):
13. Featured papers section on home page
14. Text-to-speech
15. Citations/references display

---

## SUCCESS METRICS

At the end of 24 hours, you should have:

✅ **Core Features:**
- Multi-turn RAG chatbot with citation highlighting
- User authentication and profiles
- Follow system
- Paper search and reading
- Comments with threading and voting
- Star ratings

✅ **Social Features:**
- Activity feed
- User library/history
- PDF upload (private)

✅ **AI Features:**
- Multi-paper conversations via @mentions
- 3 summary lengths
- Citation hover to PDF highlight

✅ **Deployed:**
- Live on Vercel
- All features tested
- Documentation updated

---

## IMPLEMENTATION NOTES

### Cost Estimates (24-hour period + Demo):

**Pre-Demo Setup:**
- **Metadata sync** (10,000 papers): FREE (just API calls)
- **Pre-load 500 papers**: ~$0.40 (embedding cost)
- **Time**: 2.5-3.5 hours total (can run overnight)

**During Demo:**
- **On-demand processing** (if rare paper): ~$0.001 per paper
- **Chat**: ~$0.01-0.02 per conversation (gpt-4o-mini)
- **Likely total**: <$1 for entire demo

**Development & Testing (24 hours):**
- **OpenAI API**: $5-15 (chat + embeddings)
- **Qdrant**: Free tier (up to 1GB, ~200k chunks)
- **Typesense**: Free self-hosted or $10/month cloud
- **Firebase**: Free tier (generous limits)
- **Vercel**: Free tier
- **arXiv API**: FREE (just respect rate limits)

**Total: ~$5-30 for development + demo**

### Demo Coverage Analysis:

With 500-1000 pre-loaded papers:
- ✅ **80-90% chance** audience request is pre-loaded → **INSTANT** (0-2 sec)
- ⚡ **10-20% chance** needs on-demand → **FAST** (10-15 sec with slick UI)
- ✅ **Either way looks professional!**

Popular paper categories pre-loaded:
- GPT models, Transformers, BERT, Vision models
- Recent 2023-2025 papers in cs.AI, cs.LG, cs.CV, cs.CL
- Top cited/downloaded papers

**Demo Success Rate: 95%+** (even rare papers work, just with 15-sec wait)

### Performance Tips:
- Cache embeddings where possible
- Use streaming for chat responses
- Lazy load components
- Optimize images/PDFs
- Use SWR for data fetching

### Security Considerations:
- Firestore security rules for all collections
- Validate file uploads (size, type)
- Rate limit API routes
- Sanitize user inputs
- Secure API keys

---

## DEMO DAY CHECKLIST

### Night Before (3-4 hours setup time):
- [ ] Run `npm run sync-metadata` (30 min) - Index 10,000+ papers
- [ ] Run `npm run preload-demo` (2-3 hours) - Process 500-1000 papers
- [ ] Deploy to Vercel production
- [ ] Test 5-10 random papers to verify instant chat
- [ ] Sleep well! 

### Morning of Demo (30 min prep):
- [ ] Verify production site is up
- [ ] Test featured papers load on home page
- [ ] Test instant chat on "GPT-4", "Transformer", "BERT"
- [ ] Test on-demand processing with obscure paper
- [ ] Prepare demo account with some activity (comments, ratings)
- [ ] Have backup papers ready: GPT-3, GPT-4, Attention, BERT, CLIP

### During Demo:
- [ ] Start with featured papers section (shows preparation)
- [ ] Ask audience for paper suggestion (builds engagement)
- [ ] If instant → looks amazing!
- [ ] If 15-sec wait → still looks professional with progress UI
- [ ] Show multi-paper chat with @mentions
- [ ] Show citation highlighting
- [ ] Show social features
- [ ] Take questions
