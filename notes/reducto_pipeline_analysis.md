# Reducto PDF-to-RAG Workflow Analysis

## TL;DR
- Reducto's `/parse` endpoint can accept either a direct `document_url` (ideal for `https://arxiv.org/pdf/<id>.pdf`) or a multipart upload, then returns layout-aware JSON chunks with bounding boxes, table/form fidelity, and inline citation metadata suitable for our Qdrant-backed RAG layer ([docs](https://docs.reducto.ai/api-reference/parse), [output reference](https://llms.reducto.ai/api-json-output-format-reference)).
- Chunking controls (mode, size, overlap, heading/table preservation) let us offload all PDF splitting heuristics to Reducto and consistently feed our OpenAI embeddings pipeline (e.g., `text-embedding-3-small`) the `data.chunks` array ([chunking guide](https://llms.reducto.ai/chunking-api)).
- We can run synchronous parses for most papers, but larger PDFs should use `POST /parse_async` plus a webhook/poll loop via Reducto's Svix integration to avoid tying up the page load ([async pattern](https://docs.reducto.ai/async-invocation), [webhooks](https://docs.reducto.ai/recipes/svix-webhooks)).
- The plan works technically, but we still own embeddings + Qdrant persistence, job orchestration, and cache invalidation (e.g., avoid reparsing the same arXiv ID; store Reducto `job_id` + chunk hashes in Firestore/Storage).

## Proposed end-to-end flow
1. **User picks a paper in Typesense search** → we already have its arXiv ID/metadata; fetch/display PDF via the existing viewer.
2. **Kick off Reducto parse concurrently** using `document_url: https://arxiv.org/pdf/<id>.pdf` (or upload if the PDF must be proxied). Include options such as `retention: 0` (zero data retention), `output.format: json`, `output.chunking` block for chunk settings, and `tables.export: "cells"` for faithful table JSON (per curl example in Reducto docs).
3. **Handle response mode**:
   - Synchronous `/parse` for ~10–20 page PDFs; response directly contains `pages[]`, `chunks[]`, etc.
   - For larger works (long-form papers, appendices) call `/parse_async` with `settings.persist_results` and rely on either polling `GET /retrieve-parse` or receiving a Svix webhook when `job_id` is ready.
4. **Embed and store**: For each Reducto chunk (fields: `chunk_id`, `content`, `source_blocks`, `citation.page`, `citation.bbox`), run our existing OpenAI embedding step (`text-embedding-3-small` per `functions/src/index.ts`), then upsert to Qdrant keyed by `paperId + chunk_id`, storing citations + block metadata for future grounding.
5. **Serve RAG**: Retrieval uses Qdrant (semantic) and Typesense (lexical) over the same chunk set. Responses can surface Reducto-supplied citations (page/bbox), providing clickable highlights in the PDF viewer. Notes/chat threads can reference `chunk_id` to keep provenance stable.

## Reducto capabilities that support the flow
### Document ingestion & parsing
- `POST /parse` takes either `document_url` JSON or `multipart/form-data` with `file`; both require the `Authorization: Bearer <REDUCTO_API_KEY>` header.
- Options payload supports `retention` flags (0 = zero data retention), `output.format` (`json`, `markdown`, etc.), and toggles for bbox, OCR enhancement, and table export style (example from docs shows `tables: { "export": "cells" }`).
- For heavy workloads, `POST /parse_async` + `GET /retrieve-parse` are available; async payload includes `settings.force_url_result`, `persist_results`, `return_images`, etc., so we can request hosted JSON if responses exceed inline size limits (sample payload in docs shows `settings.persist_results: False`, `return_images: []`, `spreadsheet.split_large_tables.enabled: True`).

### Chunking & metadata
- Chunk configuration options include `chunk_mode` (`variable`, `block`, `page`, `fixed_length`), `chunk_size`, `chunk_overlap`, `respect_headings`, and `keep_tables_and_figures`. Default variable mode targets ~1k characters with adaptive 250–1500 spans ([chunking API reference](https://llms.reducto.ai/chunking-api)).
- Example JSON: `{"chunk_mode":"variable","chunk_size":1000,"chunk_overlap":200,"respect_headings":true,"keep_tables_and_figures":true}`—matching our desire to prevent table splits and keep section integrity.
- Reducto also exposes `retrieval.embedding_optimized` (per async payload snippet) in case we want them to pre-trim whitespace or token-heavy artifacts prior to embedding.

### Response format
- JSON output contains `pages[] -> blocks[]` with `type` (paragraph/table/figure), `content`, `bbox`, and `confidence`, plus a top-level `chunks[]` array, each with `chunk_id`, `type`, `content`, `source_blocks`, and `citation` metadata (page + bounding box). This is ideal for linking chat answers back to the PDF ([output reference](https://llms.reducto.ai/api-json-output-format-reference)).
- The same schema works for tables/forms/spreadsheets; Reducto will split large tables (`spreadsheet.split_large_tables`) and can optionally cluster rows.
- When `settings.force_url_result` is true, the API returns a temporary URL to download the JSON (not just inline) so we should plan to dereference that and cache results in our storage bucket before running embeddings.

### Async orchestration
- Reducto supports webhook notifications via Svix (docs show how to register endpoints, rotate secrets, and verify signatures). We could register a `papers/<paperId>/reducto` webhook handler in our Next.js API routes to trigger embedding/Qdrant ingestion as soon as parsing completes.
- The async invocation guide recommends: issue `POST /parse_async`, store the returned `job_id`, optionally poll `GET /retrieve-parse?job_id=...`, and fall back to webhook notifications for long runs or batch pipelines.

## Integration considerations for SocialArxiv
- **Trigger point**: Start parsing when a user opens the PDF or when we ingest the paper into our catalog. Background ingestion paired with our `scripts/ingest.mjs` avoids per-user latency; on-demand parsing keeps compute costs tied to actual reads. Either way we can cache the resulting JSON in Firestore/Storage keyed by arXiv ID.
- **Embedding pipeline**: Reducto does not return embeddings, so our existing OpenAI embedding + Qdrant upsert code stays. We just replace the chunk-generation/cleaning steps with Reducto output.
- **Search alignment**: Because chunk IDs map back to PDF blocks + citations, we can surface citations during chat and note-taking, something our current handmade chunker struggles with. Typesense can index the same chunk text for lexical fallback.
- **Latency budget**: Synchronous parse responses reportedly take a few seconds for normal PDFs; to keep the reader snappy we should fire the parse request via background API route (e.g., Next.js Route Handler) and show a “processing” indicator for semantic chat until Qdrant confirms ingestion.
- **Storage/security**: Using `retention: 0` plus `persist_results: False` gives us zero data-retention guarantees, but means we must store JSON ourselves if we need to re-embed later. If we want Reducto to host results for re-download, set `persist_results: True` and capture the returned URL; their docs highlight SOC2/HIPAA compliance if that matters for user assurances.
- **Error handling**: Need retries for transient fetch failures (arXiv occasionally rate-limits). If Reducto can’t reach the `document_url`, fallback to downloading the PDF ourselves and re-uploading through the multipart interface.

## Open questions / follow-ups
1. **Cost & throughput**: Need pricing/credit info (see Reducto FAQ on credit usage) to ensure parsing every opened paper is financially viable.
2. **Caching policy**: Decide where to store the canonical JSON (Firestore vs. Storage bucket) and how to detect when a paper has already been processed to skip duplicate work.
3. **Async vs. sync threshold**: Empirically determine PDF size/page-count thresholds where we must switch to async to avoid timeouts.
4. **Access control**: Confirm arXiv PDFs are always publicly readable by Reducto’s servers; otherwise we need a signed proxy URL.
5. **Monitoring**: Integrate webhook signature verification + job status logging to catch parsing failures early; consider a dashboard in Firebase for queued/failed jobs.

Overall, the plan is feasible: Reducto can take over PDF normalization + chunking, letting us plug the resulting structured JSON straight into the existing embedding/Qdrant layers while improving citation fidelity in chat and notes. EOF
