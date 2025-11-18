# Similar Papers Feature Setup

## Overview
The similar papers feature allows logged-in users to discover papers related to the one they're currently viewing. It uses vector similarity search on abstract-level embeddings stored in Qdrant.

## Root Cause of Initial Error
The error occurred because:
1. **No abstract-level embeddings existed** in Qdrant's `paper_semantics` collection
2. Only fulltext embeddings (created during PDF hydration) existed
3. The similar papers feature requires abstract-level embeddings for fast, efficient similarity search

## Components Implemented

### 1. API Endpoint
**File:** `app/api/papers/[paperId]/similar/route.ts`
- Authenticated endpoint (requires login)
- Uses Qdrant's vector similarity search
- Supports filtering by year (all time vs recent)
- Returns up to 10-20 similar papers
- Implements 24-hour Firestore caching
- Uses UUID-based point IDs (e.g., `uuidv5('2308.05995-abstract', namespace)`)

### 2. UI Component
**File:** `components/similar/SimilarPapersTab.tsx`
- Displays similar papers with metadata (title, abstract, categories, year, similarity score)
- Filter toggle: "All Time" vs "Recent (Last 3 Years)"
- Loading states, error handling, empty states
- Click-through navigation to similar papers

### 3. Backfill Script
**File:** `scripts/backfill_abstract_embeddings.mjs`
- Creates abstract-level embeddings for papers in Typesense
- Generates embeddings using OpenAI `text-embedding-3-small`
- Uses deterministic UUIDs for point IDs
- Supports incremental backfill (skips existing embeddings)
- Batch processing (100 papers at a time)

### 4. Qdrant Indices
**File:** `scripts/add_qdrant_indices.mjs`
- Adds payload indices for `year` (integer) and `categories` (keyword)
- Optimizes filtering performance

## Setup Instructions

### 1. Run the Backfill Script
To create abstract-level embeddings for all papers:

```bash
# For testing (first 1000 papers)
node scripts/backfill_abstract_embeddings.mjs

# For full backfill (all 33,000+ papers)
# Edit the script and remove/comment out the limit:
# if (processedCount >= 1000) break;
# Then run:
node scripts/backfill_abstract_embeddings.mjs
```

**Note:** Processing all 33,010 papers will:
- Take approximately 2-3 hours
- Cost ~$0.30 in OpenAI API fees (at $0.02/1M tokens for embeddings)
- Create ~33,000 new points in Qdrant

### 2. Verify Embeddings
Check that abstract-level embeddings exist:

```bash
node -e "import('dotenv').then(dotenv => { dotenv.config({ path: '.env.local' }); return import('@qdrant/js-client-rest'); }).then(({ QdrantClient }) => { const client = new QdrantClient({ url: process.env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY }); return client.scroll('paper_semantics', { limit: 1, filter: { must: [{ key: 'level', match: { value: 'abstract' } }] } }); }).then(r => console.log('Abstract embeddings:', r.points.length > 0 ? 'YES ✓' : 'NO ✗'));" --input-type=module
```

### 3. Test the Feature
1. Start the dev server: `npm run dev`
2. Navigate to any paper (e.g., `/paper/2308.08869`)
3. Login if not already authenticated
4. Click the "Similar" tab
5. You should see 10 similar papers

## Technical Details

### Point ID Format
- **String format:** `2308.05995-abstract` (what we want logically)
- **Qdrant requirement:** Must be UUID or unsigned integer
- **Solution:** Generate deterministic UUID using `uuidv5(paperId + '-abstract', namespace)`

### UUID Namespace
```javascript
const QDRANT_UUID_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';
```
This ensures the same paperId always generates the same UUID.

### Qdrant Collection Structure
```json
{
  "id": "uuid-here",
  "vector": [1536-dimensional embedding],
  "payload": {
    "paperId": "2308.05995",
    "level": "abstract",
    "title": "Paper title",
    "abstract": "Paper abstract",
    "categories": ["cs.AI", "cs.LG"],
    "year": 2023
  }
}
```

### Filters Used
```javascript
{
  must: [
    { key: 'level', match: { value: 'abstract' } },
    { key: 'year', range: { gte: 2021 } }  // optional
  ],
  must_not: [
    { has_id: [currentPaperUUID] }  // exclude current paper
  ]
}
```

## Performance Optimization

### Caching Strategy
- **Cache key:** `${paperId}::${yearFilter}::${limit}`
- **Storage:** Firestore collection `similarPapers`
- **TTL:** 24 hours
- **Benefit:** Eliminates repeated Qdrant queries for popular papers

### Future Improvements
1. **Precompute top-K neighbors** for all papers (offline batch job)
2. **Hybrid ranking:** Combine semantic similarity + recency + category overlap
3. **Personalization:** Factor in user reading history
4. **Incremental updates:** Auto-create abstract embeddings when new papers are added

## Troubleshooting

### "Failed to fetch similar papers"
- Check if abstract embeddings exist for that paper
- Verify Qdrant connection and API key
- Check server logs for detailed error messages

### "No similar papers found"
- Paper might not have abstract-level embedding yet
- Try running backfill script
- Check year filter (switch to "All Time")

### "Bad Request" from Qdrant
- Verify point ID is a valid UUID
- Check filter syntax
- Ensure payload indices exist (run `scripts/add_qdrant_indices.mjs`)

## Maintenance

### Adding New Papers
When new papers are added to Typesense:
1. Run backfill script periodically (e.g., nightly cron job)
2. Or modify ingestion pipeline to create abstract embeddings immediately

### Cache Invalidation
If embeddings are updated:
1. Delete Firestore `similarPapers` collection
2. Or increment version in cache key

## Cost Estimation

### OpenAI API Costs
- **Model:** `text-embedding-3-small`
- **Price:** $0.02 per 1M tokens
- **Average tokens per paper:** ~200 (title + abstract)
- **Cost for 33,010 papers:** ~$0.13 - $0.30

### Qdrant Storage
- **Points:** 33,010 abstract embeddings
- **Vector size:** 1536 dimensions × 4 bytes = 6KB per point
- **Total storage:** ~200 MB
- **Free tier:** More than sufficient

## Status
✅ API endpoint created  
✅ UI component created  
✅ Backfill script created  
✅ Qdrant indices added  
✅ First 1,000 papers backfilled  
⏳ Full backfill pending (31,000+ papers remaining)
