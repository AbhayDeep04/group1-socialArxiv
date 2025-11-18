# arXiv Paper Ingestion Guide

This guide explains how to ingest all Computer Science papers from arXiv efficiently and cost-effectively.

## Overview

The system uses a **two-tier approach**:
1. **Metadata + Abstract Embeddings**: All CS papers indexed (fast, cheap)
2. **Full-Text Embeddings**: On-demand when users open papers (lazy loading)

This approach provides full coverage of arXiv CS papers at minimal cost (~$2-3 total).

---

## Architecture

### Tier 1: Metadata Layer (All Papers)
- **Typesense**: Stores metadata (title, abstract, authors, categories, year, PDF URL)
- **Qdrant**: Stores single embedding per paper (`title + abstract`)
- **Cost**: ~$1.20-$2.40 for all CS papers
- **Coverage**: 400k-600k CS papers

### Tier 2: Full-Text Layer (On-Demand)
- **Qdrant**: Stores chunked full-text embeddings (only when needed)
- **Trigger**: When user opens a paper or it ranks highly in search
- **Cost**: $0.001-0.003 per paper (only for viewed papers)

---

## Initial Setup

### Option 1: Kaggle Dataset (Recommended for Initial Load)

**Step 1: Download Kaggle Dataset**

1. Go to [Kaggle arXiv Dataset](https://www.kaggle.com/datasets/Cornell-University/arxiv)
2. Download the metadata JSON file (~100GB compressed)
3. Extract to a local directory

**Step 2: Ingest Metadata**

```bash
# Run the Kaggle harvester
npm run harvest:kaggle /path/to/arxiv-metadata-oai-snapshot.json
```

This will:
- Filter for CS papers (categories starting with `cs.*`)
- Index metadata in Typesense
- Generate embeddings for `title + abstract`
- Store embeddings in Qdrant with `level: "abstract"`

**Expected Time**: 4-8 hours for full CS dataset  
**Expected Cost**: $1.20-$2.40 (OpenAI embeddings)

---

### Option 2: OAI-PMH (For Ongoing Updates)

**Daily/Weekly Updates**

```bash
# Harvest new papers from last checkpoint
npm run harvest:oai

# Or specify a date (YYYY-MM-DD)
npm run harvest:oai 2025-01-01
```

This will:
- Use OAI-PMH protocol with `set=cs` filter
- Fetch only Computer Science papers
- Resume from last checkpoint (stored in `scripts/harvest_checkpoint.json`)
- Rate-limit to 3 seconds between requests (arXiv policy)

**Checkpoint System**:
- Automatically saves progress after each batch
- Safe to interrupt and resume
- Stores `lastProcessedDate` and `resumptionToken`

---

## On-Demand Full-Text Hydration

### How It Works

When a user opens a paper:

1. **Immediate (1-3s)**: Fetch PDF from arXiv and display
2. **Background (6-15s)**: Extract text, chunk, embed, store in Qdrant

### Manual Hydration

```bash
# Hydrate a specific paper
npm run hydrate 2301.07041

# Or with custom PDF URL
npm run hydrate 2301.07041 https://arxiv.org/pdf/2301.07041.pdf
```

### API Integration

**When user clicks "Open Paper":**

```typescript
// Frontend calls this when opening a paper
async function openPaper(paperId: string) {
  // 1. Show PDF immediately (don't wait)
  const pdfUrl = `/api/papers/${paperId}/pdf`;
  displayPdfViewer(pdfUrl);
  
  // 2. Trigger background hydration (async)
  fetch(`/api/papers/${paperId}/hydrate`, {
    method: 'POST',
    body: JSON.stringify({ pdfUrl: `https://arxiv.org/pdf/${paperId}.pdf` })
  });
}
```

**Check hydration status:**

```typescript
const response = await fetch(`/api/papers/${paperId}/hydrate`);
const { isHydrated } = await response.json();
```

---

## Cost Breakdown

### Initial Load (All CS Papers)
- **Metadata**: Free (Kaggle/OAI-PMH)
- **Abstract Embeddings**: $1.20-$2.40
  - ~500k papers × 200 tokens/abstract = 100M tokens
  - OpenAI text-embedding-3-small: $0.02 per 1M tokens
- **Total**: ~$2.40 one-time

### Ongoing Updates (Monthly)
- **New Papers**: ~5k CS papers/month
- **Cost**: ~$0.02/month for abstracts
- **Free**: OAI-PMH metadata harvesting

### On-Demand Full-Text
- **Per Paper**: $0.001-0.003
  - Typical paper: 30-50 chunks × 200 tokens = 6k-10k tokens
- **Example**: 1000 viewed papers = $1-3/month

### Total Monthly Cost
- **Metadata updates**: $0.02
- **Full-text (1000 papers)**: $1-3
- **Total**: **$1-3/month**

---

## File Structure

```
scripts/
├── harvest_cs_metadata.mjs     # Kaggle + OAI-PMH harvester
├── hydrate_fulltext.mjs        # On-demand PDF processing
├── harvest_checkpoint.json     # Progress tracking (auto-generated)
└── ingest.mjs                  # Legacy (for manual PDFs)

app/api/papers/[paperId]/
├── pdf/route.ts                # PDF proxy endpoint
└── hydrate/route.ts            # Hydration trigger + status
```

---

## Search Strategy

### Keyword Search (Fast)
```typescript
// Typesense query
const results = await typesense.search({
  q: 'transformer attention',
  query_by: 'title,abstract',
  filter_by: 'categories:cs.AI && year:>2020'
});
```

### Semantic Search (Abstract-Only)
```typescript
// Qdrant query with filter for abstracts only
const results = await qdrant.search({
  vector: embeddedQuery,
  filter: { level: 'abstract' },
  limit: 10
});
```

### Deep Semantic Search (Full-Text)
```typescript
// Qdrant query including full-text chunks
const results = await qdrant.search({
  vector: embeddedQuery,
  // No filter = search both abstract and fulltext
  limit: 50
});
```

---

## Maintenance

### Daily Cron Job (Recommended)

```bash
# Add to crontab
0 2 * * * cd /path/to/project && npm run harvest:oai >> logs/harvest.log 2>&1
```

This keeps your database up-to-date with new arXiv submissions (published daily at 8PM EST).

### Monitor Checkpoints

```bash
# View last harvest status
cat scripts/harvest_checkpoint.json
```

### Reset and Re-harvest

```bash
# Delete checkpoint to start fresh
rm scripts/harvest_checkpoint.json

# Run full OAI-PMH harvest from a specific date
npm run harvest:oai 2020-01-01
```

---

## Troubleshooting

### "Rate limit exceeded" from arXiv
- The harvester respects 3-second delays
- If using API, wait a few minutes and resume
- Checkpoint system will pick up where it left off

### "No text extracted from PDF"
- Some PDFs are scanned images (no selectable text)
- These are skipped automatically
- Logged as warnings, not errors

### "Embedding quota exceeded" (OpenAI)
- Check your OpenAI usage dashboard
- Consider batching smaller chunks
- Increase delay between embedding batches

### Large Qdrant storage
- Full-text chunks take more space than abstracts
- Monitor Qdrant cloud storage limits
- Consider purging old full-text embeddings for rarely accessed papers

---

## Performance Benchmarks

### Harvesting Speed
- **Kaggle**: ~50-100 papers/second (CPU bound)
- **OAI-PMH**: ~20-30 papers/minute (network + rate limit)

### Embedding Speed
- **Batches of 100**: ~2-3 seconds per batch
- **Full CS dataset**: 4-8 hours total

### Hydration Speed (Per Paper)
- **Download PDF**: 1-3 seconds
- **Extract text**: 2-5 seconds
- **Embed chunks**: 3-8 seconds
- **Store in Qdrant**: <1 second
- **Total**: 6-17 seconds

---

## Best Practices

1. **Start with Kaggle** for initial load (faster than OAI-PMH)
2. **Use OAI-PMH** for daily updates after initial load
3. **Monitor costs** in OpenAI dashboard during first week
4. **Cache PDFs** temporarily to avoid re-downloading for debugging
5. **Set up daily cron** for automated updates
6. **Hydrate popular papers** proactively (e.g., trending, high citations)
7. **Track metrics**: papers ingested, embeddings generated, storage used

---

## Migration from Old System

If you have existing papers in `public/pdfs/`:

```bash
# Keep using old script for local PDFs
node scripts/ingest.mjs

# New papers from arXiv use harvest scripts
npm run harvest:oai
```

The two systems coexist. Old papers have `source: "upload"`, new ones have `source: "arxiv"`.

---

## Support

- **arXiv API Docs**: https://info.arxiv.org/help/api/
- **OAI-PMH Spec**: https://info.arxiv.org/help/oa/
- **Qdrant Docs**: https://qdrant.tech/documentation/
- **Typesense Docs**: https://typesense.org/docs/

---

## Summary

✅ **Fast initial load**: Use Kaggle dataset  
✅ **Stay updated**: Daily OAI-PMH cron job  
✅ **Low cost**: $2-3 total, $1-3/month ongoing  
✅ **Full coverage**: All CS papers searchable  
✅ **Smart hydration**: Full-text only when needed  
✅ **Production ready**: Checkpoints, error handling, rate limiting
