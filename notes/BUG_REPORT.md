# SocialArxiv Bug Report & Analysis

**Generated:** November 18, 2025  
**Status:** Analysis Complete - Awaiting Implementation

## Executive Summary

After analyzing the codebase with the Oracle, the primary issues stem from:
1. **Inconsistent Qdrant collection names** between ingestion (`paper_chunks`) and API routes (`paper_semantics`)
2. **Payload schema mismatches** with unsupported filters (e.g., `level: 'fulltext'`)
3. **Naive PDF parsing/chunking** leading to poor RAG quality
4. **Missing Firestore writes** for user-owned papers during upload
5. **UI/UX gaps** (filters, reset button, theme toggle visibility)

---

## Bugs Analysis

### 🔴 Critical Bugs

#### 1. User Library Not Being Populated

**Priority:** HIGH  
**Effort:** Medium (1-3 hours)

**Files Affected:**
- `app/library/page.tsx` (lines 35-92)
- `lib/firestore/papers.ts` (helper functions)
- Upload API/Cloud Functions

**Root Cause:**
- The ingestion script (`scripts/ingest.mjs`) only writes to Typesense and Qdrant, not Firestore
- Library page depends on Firestore documents with `userId` field to populate tabs
- Upload flow may not create/update Firestore documents consistently
- Possible field name mismatch (`userId` vs `ownerId`)

**Current Behavior:**
- Uploaded papers don't appear in Library > Uploaded tab
- User-owned papers list is empty

**Proposed Fix:**
```typescript
// In upload API/Cloud Function:
// 1. Create Firestore document on upload
await admin.firestore().collection('papers').doc(paperId).set({
  userId: userId,           // Must match library query field
  title: metadata.title,
  authors: metadata.authors,
  abstract: metadata.abstract,
  status: 'uploading',      // uploading → processing → ready/failed
  tags: metadata.tags,
  year: metadata.year,
  venue: metadata.venue,
  pdfUrl: storageUrl,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp()
});

// 2. Update status as ingestion progresses
await paperRef.update({
  status: 'processing',
  updatedAt: FieldValue.serverTimestamp()
});

// 3. On completion/failure
await paperRef.update({
  status: 'ready', // or 'failed'
  errorMessage: error?.message,
  updatedAt: FieldValue.serverTimestamp()
});
```

**Verification:**
- Upload a paper and check Firestore console for `papers/{paperId}` document
- Verify `userId` field matches authenticated user
- Check Library page displays uploaded paper with correct status

---

#### 2. AI Assistant Grabbing Context from Wrong Paper

**Priority:** CRITICAL  
**Effort:** Small (<1 hour)

**Files Affected:**
- `app/api/chat/ask/route.ts` (line 16)
- `scripts/ingest.mjs` (line 24)
- All Qdrant-related API routes

**Root Cause:**
- **Collection name mismatch:**
  - Ingestion writes to: `paper_chunks`
  - Chat API queries: `paper_semantics`
- Results in 0 hits or hits from stale/incorrect dataset
- AI receives wrong context or generic knowledge, giving irrelevant answers

**Current Behavior:**
- User asks about current paper
- RAG retrieves chunks from different papers or nothing
- AI gives generic or incorrect responses

**Proposed Fix:**
```typescript
// 1. Add environment variable
// .env.local
QDRANT_COLLECTION_NAME=paper_chunks

// 2. Update all Qdrant usage
// app/api/chat/ask/route.ts
const qdrantCollectionName = process.env.QDRANT_COLLECTION_NAME!;

// scripts/ingest.mjs
const qdrantCollectionName = process.env.QDRANT_COLLECTION_NAME || 'paper_chunks';

// 3. Apply to all routes using Qdrant:
// - app/api/chat/ask/route.ts
// - app/api/papers/[paperId]/audio/route.ts
// - app/api/papers/[paperId]/similar/route.ts
// - app/api/papers/[paperId]/text/route.ts
```

**Verification:**
- Open a paper and ask AI a specific question about it
- Verify AI response includes relevant context from that specific paper
- Check Qdrant query logs show correct collection and paperId filter

---

#### 3. Paper Uploaded but Not Ingested into Vector DB

**Priority:** CRITICAL  
**Effort:** Medium (1-3 hours)

**Files Affected:**
- `scripts/ingest.mjs`
- Upload Cloud Function
- `app/api/papers/[paperId]/text/route.ts`

**Root Cause:**
- Same collection mismatch as Bug #2
- `pdfreader` library fails silently on many PDFs
- No error logging or status updates in Firestore
- "No text chunks generated" silently skips ingestion

**Current Behavior:**
- User uploads PDF
- Ingestion fails or writes to wrong collection
- Paper appears in UI but RAG/TTS features don't work
- No error feedback to user

**Proposed Fix:**
```javascript
// 1. Use env for collection name (see Bug #2)

// 2. Replace pdfreader with more robust parser
// Install: npm install pdf-parse
import pdfParse from 'pdf-parse';

async function extractTextFromPDF(pdfBuffer) {
  try {
    // Try pdf-parse first
    const data = await pdfParse(pdfBuffer);
    return data.text;
  } catch (error) {
    console.warn('pdf-parse failed, trying pdfreader fallback:', error);
    // Fallback to pdfreader
    return extractWithPdfReader(pdfBuffer);
  }
}

// 3. Log errors to Firestore
if (!chunks.length) {
  await admin.firestore().collection('papers').doc(paperId).update({
    status: 'failed',
    errorMessage: 'No text could be extracted from PDF',
    updatedAt: FieldValue.serverTimestamp()
  });
  throw new Error('PDF text extraction failed');
}

// 4. Update status on success
await admin.firestore().collection('papers').doc(paperId).update({
  status: 'ready',
  chunkCount: chunks.length,
  updatedAt: FieldValue.serverTimestamp()
});
```

**Verification:**
- Upload various PDF formats (scanned, native, multi-column)
- Check Firestore for status updates
- Verify Qdrant has chunks with correct `paperId`
- Test RAG chat on newly uploaded paper

---

#### 4. RAG Quality Issues (Bad Text Normalization/Chunking)

**Priority:** HIGH  
**Effort:** Medium (1-3 hours)

**Files Affected:**
- `scripts/ingest.mjs` (lines 52-88)
- All ingestion pipelines

**Root Cause:**
- Character-based chunking breaks semantic boundaries
- No sentence/paragraph awareness
- PDF extraction preserves headers/footers/noise
- No text normalization (whitespace, hyphenation)
- References section included in chunks

**Current Behavior:**
- Chunks break mid-sentence
- Retrieval returns incomplete/fragmented context
- Headers/footers pollute semantic search
- Poor answer quality from AI

**Proposed Fix:**
```javascript
// 1. Add text normalization
function normalizeText(text) {
  return text
    // Fix hyphenation at line breaks
    .replace(/-\n/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    // Remove page numbers/headers (heuristic)
    .replace(/^\d+\s*$/gm, '')
    // Remove multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 2. Strip references section
function stripReferences(text) {
  const refPatterns = [
    /\n\s*References\s*\n/i,
    /\n\s*Bibliography\s*\n/i,
    /\n\s*Works Cited\s*\n/i
  ];
  
  for (const pattern of refPatterns) {
    const match = text.search(pattern);
    if (match !== -1) {
      return text.substring(0, match);
    }
  }
  return text;
}

// 3. Sentence-aware chunking
function chunkBySentences(text, maxTokens = 250, overlapTokens = 50) {
  // Split by sentence boundaries
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;
  
  for (const sentence of sentences) {
    const sentenceTokens = Math.ceil(sentence.length / 4); // ~4 chars/token
    
    if (currentLength + sentenceTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
      
      // Overlap: keep last few sentences
      const overlapSentences = [];
      let overlapLength = 0;
      for (let i = currentChunk.length - 1; i >= 0; i--) {
        const s = currentChunk[i];
        const sTokens = Math.ceil(s.length / 4);
        if (overlapLength + sTokens > overlapTokens) break;
        overlapSentences.unshift(s);
        overlapLength += sTokens;
      }
      
      currentChunk = overlapSentences;
      currentLength = overlapLength;
    }
    
    currentChunk.push(sentence);
    currentLength += sentenceTokens;
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }
  
  return chunks;
}

// 4. Updated ingestion pipeline
const rawText = await extractTextFromPDF(pdfBuffer);
const normalizedText = normalizeText(rawText);
const cleanedText = stripReferences(normalizedText);
const chunks = chunkBySentences(cleanedText, 250, 50);
```

**Verification:**
- Re-ingest sample papers
- Check chunk quality (no mid-sentence breaks)
- Test RAG retrieval quality with specific questions
- Verify no headers/footers in retrieved context

---

### 🟡 Medium Priority Bugs

#### 5. Star Rating Takes Too Long

**Priority:** MEDIUM  
**Effort:** Small (<1 hour)

**Files Affected:**
- `app/api/papers/[paperId]/rating/route.ts`
- Rating UI components

**Root Cause:**
- Cold starts on serverless (no explicit runtime)
- Transaction reads both user rating + aggregates
- No optimistic UI updates
- No runtime hints for Vercel

**Current Behavior:**
- User clicks star rating
- 2-5 second delay before update
- Poor UX, feels broken

**Proposed Fix:**
```typescript
// 1. Add runtime hints
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 2. Optimize transaction (optional)
// Instead of reading aggregates, use FieldValue.increment
const oldRating = existingDoc?.data()?.rating || 0;
const delta = rating - oldRating;
const countDelta = existingDoc ? 0 : 1;

const batch = admin.firestore().batch();

batch.set(userRatingRef, {
  rating,
  updatedAt: FieldValue.serverTimestamp()
}, { merge: true });

batch.set(aggregateRef, {
  sum: FieldValue.increment(delta),
  count: FieldValue.increment(countDelta),
  updatedAt: FieldValue.serverTimestamp()
}, { merge: true });

await batch.commit();

// 3. Add optimistic UI update
// In RatingPopover component:
const handleRating = async (value: number) => {
  // Immediate UI update
  setOptimisticRating(value);
  
  try {
    await submitRating(value);
    // Success - optimistic state matches reality
  } catch (error) {
    // Revert on error
    setOptimisticRating(previousRating);
    toast.error('Failed to save rating');
  }
};
```

**Verification:**
- Click star rating
- Expect <500ms response
- Check Firestore for correct values
- Test concurrent ratings from multiple users

---

#### 6. Text-to-Speech Only Takes First 1000 Characters

**Priority:** MEDIUM  
**Effort:** Medium (1-3 hours)

**Files Affected:**
- `app/api/papers/[paperId]/audio/route.ts` (lines 88-92)

**Root Cause:**
- ElevenLabs plan enforces ~1000-2500 char limit per request
- Wrong Qdrant filter (`level: 'fulltext'`) not in payload schema
- Results in 0 chunks or very few chunks retrieved
- No chunked generation for long text

**Current Behavior:**
- TTS stops after ~1000 characters
- Often doesn't work at all due to filter mismatch
- Users can't listen to full abstract + intro

**Proposed Fix:**
```typescript
// 1. Fix Qdrant filter
async function fetchAllChunks(paperId: string) {
  const collection = process.env.QDRANT_COLLECTION_NAME || 'paper_chunks';
  
  const results = await qdrant.scroll(collection, {
    filter: {
      must: [
        { key: 'paperId', match: { value: paperId } }
        // REMOVE level filter - not in schema
      ]
    },
    limit: 1000,
    with_payload: true,
    order_by: 'chunkIndex' // Ensure correct order
  });
  
  return results.points
    .map(p => p.payload)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
}

// 2. Implement chunked TTS generation
const MAX_CHARS_PER_REQUEST = 900; // Safe limit for your plan

function splitIntoTTSChunks(text: string, maxChars: number) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = '';
  
  for (const sentence of sentences) {
    if ((current + sentence).length > maxChars) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current) chunks.push(current.trim());
  
  return chunks;
}

// 3. Generate and concatenate audio
const textChunks = splitIntoTTSChunks(cleanedText, MAX_CHARS_PER_REQUEST);
const audioBuffers = [];

for (const chunk of textChunks) {
  const response = await elevenlabs.generate({
    voice: selectedVoice,
    text: chunk,
    model_id: 'eleven_monolingual_v1'
  });
  
  const buffer = await streamToBuffer(response);
  audioBuffers.push(buffer);
}

// Concatenate MP3 buffers (simple approach)
const finalAudio = Buffer.concat(audioBuffers);
```

**Verification:**
- Test TTS on papers with long abstracts
- Verify full abstract + introduction is read
- Check audio quality at chunk boundaries
- Monitor ElevenLabs usage/costs

---

#### 7. Last Papers Ingested (Page 1651) Won't Open

**Priority:** MEDIUM  
**Effort:** Medium (1-3 hours)

**Files Affected:**
- `scripts/ingest.mjs`
- `app/paper/[paperId]/page.tsx`
- Qdrant collection consistency

**Root Cause:**
- Collection name mismatch (see Bug #2)
- Papers exist in Typesense but vectors missing in queried collection
- Paper detail page may expect Firestore metadata
- PDF URL validation issues

**Current Behavior:**
- Papers from recent ingestion batches show in search
- Clicking them results in 404 or blank page
- RAG/TTS features fail

**Proposed Fix:**
```typescript
// 1. Fix collection mismatch (see Bug #2)

// 2. Make paper detail page resilient
// app/paper/[paperId]/page.tsx
async function getPaperMetadata(paperId: string) {
  // Try Firestore first
  const firestoreDoc = await admin.firestore()
    .collection('papers')
    .doc(paperId)
    .get();
  
  if (firestoreDoc.exists) {
    return firestoreDoc.data();
  }
  
  // Fallback to Typesense
  const typesenseClient = getTypesenseClient();
  const result = await typesenseClient
    .collections('papers')
    .documents(paperId)
    .retrieve();
  
  return result;
}

// 3. Validate PDF URL
function validatePdfUrl(paperId: string, pdfUrl?: string) {
  if (pdfUrl) return pdfUrl;
  
  // Check if arXiv format
  if (/^\d{4}\.\d{5}$/.test(paperId)) {
    return `https://arxiv.org/pdf/${paperId}.pdf`;
  }
  
  // Local fallback
  return `/api/papers/${paperId}/pdf`;
}

// 4. Add Qdrant health check
async function checkPaperVectors(paperId: string) {
  const result = await qdrant.scroll(collection, {
    filter: { must: [{ key: 'paperId', match: { value: paperId } }] },
    limit: 1
  });
  
  return result.points.length > 0;
}
```

**Verification:**
- Navigate to page 1651 papers
- Verify papers open and display correctly
- Check RAG chat works on these papers
- Verify PDF loads properly

---

### 🟢 Low Priority / UX Improvements

#### 8. Toggle Theme Button Doesn't Show if User Not Logged In

**Priority:** LOW  
**Effort:** Small (<1 hour)

**Files Affected:**
- `app/page.tsx` (lines 156-167)
- Layout/navigation components

**Root Cause:**
- Theme toggle component gated behind auth check
- Or not rendered in unauthenticated header

**Current Behavior:**
- Non-logged-in users can't toggle dark mode
- Poor UX for browsing

**Proposed Fix:**
```tsx
// app/page.tsx or layout
<div className="flex items-center gap-2">
  {/* Always visible */}
  <ThemeToggle />
  
  {/* Auth-specific controls */}
  {!authLoading && !user && (
    <>
      <Link href="/login">
        <Button variant="ghost">Login</Button>
      </Link>
      <Link href="/register">
        <Button>Sign Up</Button>
      </Link>
    </>
  )}
</div>
```

**Verification:**
- Open app in incognito mode
- Verify theme toggle is visible and functional
- Check toggle persists after login

---

#### 9. Can't Filter by Categories Before Searching

**Priority:** LOW  
**Effort:** Medium (1-2 hours)

**Files Affected:**
- `app/page.tsx` (lines 65-76)
- `app/api/papers/search/route.ts` (lines 35-37 - TODO comments)

**Root Cause:**
- UI doesn't expose category filters
- API doesn't support `facet_by` or `filter_by`
- Typesense schema has categories but not used

**Current Behavior:**
- Users must search then filter mentally
- Can't browse by category
- No facet counts shown

**Proposed Fix:**
```typescript
// 1. Update API route
// app/api/papers/search/route.ts
const categories = searchParams.getAll('category');

const searchParameters = {
  q: query || '*',
  query_by: 'title,abstract,authors',
  per_page: 20,
  page: page,
  facet_by: 'categories',
  max_facet_values: 50,
  ...(categories.length && {
    filter_by: `categories:=[${categories.join(',')}]`
  })
};

// Return facets in response
return NextResponse.json({
  hits: results.hits,
  page: results.page,
  facets: results.facet_counts
});

// 2. Update UI
// app/page.tsx
const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
const [facets, setFacets] = useState<any[]>([]);

// Fetch facets on mount
useEffect(() => {
  fetchPapers('*', 1); // Get initial facets
}, []);

// Category filter chips
<div className="flex flex-wrap gap-2 mb-4">
  {facets.map(facet => (
    <Badge
      key={facet.value}
      variant={selectedCategories.includes(facet.value) ? 'default' : 'outline'}
      className="cursor-pointer"
      onClick={() => toggleCategory(facet.value)}
    >
      {facet.value} ({facet.count})
    </Badge>
  ))}
</div>
```

**Verification:**
- Load home page and see category chips
- Click category to filter
- Verify paper count updates
- Combine with search query

---

#### 10. No Button to Reset Search on Home Page

**Priority:** LOW  
**Effort:** Small (<30 minutes)

**Files Affected:**
- `app/page.tsx` (lines 143-155)

**Root Cause:**
- No clear/reset control in search form
- Users must manually delete text

**Current Behavior:**
- Must manually clear search input
- No quick way to reset to all papers

**Proposed Fix:**
```tsx
// Add reset button to search form
<form onSubmit={handleSearch} className="flex gap-2">
  <Input
    type="text"
    placeholder="Search papers..."
    value={searchTerm}
    onChange={(e) => setSearchTerm(e.target.value)}
    className="flex-1"
  />
  <Button type="submit">Search</Button>
  
  {/* New reset button */}
  {searchTerm && (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        setSearchTerm('');
        fetchPapers('*', 1);
      }}
    >
      Reset
    </Button>
  )}
</form>

// Or add clear icon inside input
<div className="relative flex-1">
  <Input
    type="text"
    placeholder="Search papers..."
    value={searchTerm}
    onChange={(e) => setSearchTerm(e.target.value)}
  />
  {searchTerm && (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="absolute right-2 top-1/2 -translate-y-1/2"
      onClick={() => {
        setSearchTerm('');
        fetchPapers('*', 1);
      }}
    >
      ✕
    </Button>
  )}
</div>
```

**Verification:**
- Enter search query
- Verify reset button appears
- Click reset and verify papers reload

---

## Implementation Priority

### Phase 1: Critical Fixes (Complete First)
1. ✅ **Bug #2**: Unify Qdrant collection names (30 min)
2. ✅ **Bug #3**: Fix upload ingestion + Firestore writes (2 hours)
3. ✅ **Bug #1**: Ensure library population (1 hour)

### Phase 2: Quality Improvements
4. ✅ **Bug #4**: Improve RAG chunking/normalization (2 hours)
5. ✅ **Bug #6**: Fix TTS chunking + filters (2 hours)
6. ✅ **Bug #7**: Fix page 1651 papers (1 hour)

### Phase 3: Performance & UX
7. ✅ **Bug #5**: Optimize ratings (1 hour)
8. ✅ **Bug #8**: Add theme toggle for all users (15 min)
9. ✅ **Bug #10**: Add reset button (15 min)
10. ✅ **Bug #9**: Add category filters (2 hours)

**Total Estimated Effort:** ~12-18 hours

---

## Testing Checklist

### After Each Fix
- [ ] Run `npm run build` - ensure no type errors
- [ ] Run `npm run lint` - ensure code quality
- [ ] Run `npm run test` - ensure tests pass
- [ ] Manual testing of affected feature
- [ ] Check Firestore/Qdrant data consistency

### Integration Testing
- [ ] Upload new paper → verify library, RAG, TTS all work
- [ ] Search → filter → reset flow
- [ ] Rate paper → verify speed and accuracy
- [ ] Ask AI about specific papers → verify correct context
- [ ] Test on page 1651 papers
- [ ] Test theme toggle for logged out users

### Regression Testing
- [ ] Existing features still work (comments, notes, bookmarks)
- [ ] Authentication flows unchanged
- [ ] Previous papers still accessible
- [ ] PDF viewing and zoom controls functional

---

## Environment Variables to Add

```bash
# .env.local
QDRANT_COLLECTION_NAME=paper_chunks
```

---

## Notes from Commit History

### Relevant Technical Details from Commits:

**Library Permissions Issue (commit 734c02f):**
> Known Issues:
> - Library page collectionGroup queries for notes/comments failing with 'Missing or insufficient permissions' error
> - The recursive wildcard rules in firestore.rules may need adjustment

**Hydration Issues (commits b440522, 1c99839):**
> Fix hydration to work on Vercel production - papers return 0 hits because hydration never completed on serverless

**Collection Name Changes (commit 7b9fa4c):**
> Update Qdrant collection name to 'paper_semantics' for consistency

**TTS Character Limit (commit 414440d):**
> 10k character limit (typically Abstract + Introduction)
> Excludes references section from audio

---

## Advanced Optimizations (Future Consideration)

### If RAG Quality Remains Poor
- Adopt LangChain RecursiveCharacterTextSplitter (~1k tokens, 200 overlap)
- Add re-ranking step (Cohere rerank-small) on top-50 vector hits → top-6
- Store section metadata (Abstract, Intro, Methods, etc.)
- Implement hybrid retrieval (BM25 + vector)

### If Ratings Need Scale
- Move aggregation to Firestore-triggered Cloud Function
- Cache aggregated ratings via CDN
- Pre-compute ratings for popular papers

### If TTS Needs Long-Form Audio
- Pre-compute audio per section in background job
- Store in Firebase Storage with signed URLs
- Return playlist/streaming response

---

## Health Check Endpoint (Recommended)

Create a simple health check to verify system consistency:

```typescript
// app/api/health/route.ts
export async function GET() {
  const checks = {
    qdrant: {
      collection: process.env.QDRANT_COLLECTION_NAME,
      exists: false,
      pointCount: 0
    },
    typesense: {
      documentsCount: 0
    },
    firestore: {
      papersCount: 0
    }
  };
  
  try {
    // Check Qdrant
    const collection = await qdrant.getCollection(checks.qdrant.collection);
    checks.qdrant.exists = true;
    checks.qdrant.pointCount = collection.points_count;
    
    // Check Typesense
    const tsCollection = await typesense.collections('papers').retrieve();
    checks.typesense.documentsCount = tsCollection.num_documents;
    
    // Check Firestore
    const snapshot = await admin.firestore().collection('papers').count().get();
    checks.firestore.papersCount = snapshot.data().count;
    
    return NextResponse.json({ status: 'healthy', checks });
  } catch (error) {
    return NextResponse.json({ status: 'unhealthy', error: error.message }, { status: 500 });
  }
}
```

---

**End of Report**
