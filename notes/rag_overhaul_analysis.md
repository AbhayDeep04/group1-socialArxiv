# RAG Overhaul Analysis

This document evaluates how the existing SocialArxiv stack would need to evolve to support the proposed end-to-end RAG revamp. It highlights what is already in place, what is missing, and the major technical decisions/risk areas for each step of the desired pipeline.

## 1. Current Stack Snapshot

- **PDF ingestion (legacy scripts)** – `scripts/ingest.mjs` and `scripts/hydrate_fulltext.mjs` parse PDFs with `pdfreader`, chunk plain text at fixed character widths, and embed with `text-embedding-3-small` before writing to Qdrant collections (`paper_chunks` vs `paper_semantics`). There is no structural parsing, figure capture, or page/section metadata.
- **User-upload ingestion (Cloud Function)** – `functions/src/index.ts` downloads PDFs from Firebase Storage, uses the same naive chunking, and writes minimal payloads (page number + raw text) into Qdrant.
- **Retrieval + generation** – `app/api/chat/ask/route.ts` embeds the query with OpenAI, performs a single-vector similarity search, concatenates the raw chunk text, and prompts an LLM. There is no reranking, HyDE, citation grounding, or Self-RAG loop.
- **UI affordances** – Chat responses currently ignore the `sources` field; however, the PDF reader already supports annotation rectangles (`lib/types/note.ts`, `components/pdf/AnnotationLayer.tsx`). These shapes could be repurposed for auto-highlighted citations if we store bounding boxes/page anchors in the payloads.

This baseline means every step of the desired pipeline would be a net-new capability, but the codebase already has Firebase, Qdrant, Typesense, and a Next.js App Router layout that can host new services.

## 2. Proposed Pipeline Feasibility

### Step 1 – Fetch metadata + structured content

- **What exists**: We already harvest arXiv metadata via `scripts/harvest_cs_metadata.mjs`, but we only ingest title/abstract text. There is no integration with ar5iv HTML, Docling, Marker, or Nougat.
- **What is needed**: Stand up a robust document parsing service. Docling/Marker/Nougat plus PDFFigures2 are CPU/GPU-heavy and typically run in Python/Java. They will not run inside the current Next.js or Firebase Functions environment without a separate worker (e.g., Cloud Run, self-hosted VM, or an external service). Output should include:
  - Cleaned text with layout information (heading tree, paragraphs, tables, equations).
  - PDFFigures2 crops (saved to Firebase Storage) and JSON metadata (captions, bounding boxes, page numbers).
  - A unified ID scheme so figures/equations tie back to paragraphs and the UI.
- **Feasibility**: High if we are willing to run extra infrastructure; not practical inside Vercel/Next serverless functions.

### Step 2 – Build DocJSON with anchors

- **Current gap**: No schema exists to store structured sections/equations. Firestore `papers` documents only track high-level metadata.
- **Needed work**:
  - Define a DocJSON schema (e.g., sections array, paragraphs with `sectionPath`, `page`, `charOffset`, `figureRefs`, `equationRefs`, `bbox`, etc.).
  - Store the DocJSON per paper (Firestore subcollection, Firebase Storage JSON file, or Qdrant payload). Consider versioning because different parsers output different fidelity.
  - Attach PDFFigures2 crops + captions (maybe separate `figures/{paperId}/{figureId}.png` plus metadata stored alongside DocJSON).
- **Feasibility**: Straightforward schema work, but depends on Step 1 delivering reliable structured output.

### Step 3 – Section-aware chunking + RAPTOR hierarchy

- **Current state**: Chunking ignores headings and sentences. There is no hierarchical index.
- **Implementation outline**:
  - Use DocJSON to chunk by semantic units (paragraphs, tables, figure captions) and maintain parent-child relationships.
  - Build RAPTOR: create leaf embeddings per paragraph, then aggregate upward to section-level and document-level summaries stored either in Qdrant (separate `level` payload) or Firestore.
  - Persist adjacency data (previous/next paragraph IDs) for later context expansion.
- **Challenges**: Need a RAPTOR implementation in TypeScript or to call out to Python (LangChain, llamaindex). If we keep everything in Node, we may need to port RAPTOR logic manually. Memory usage will rise because RAPTOR stores multiple embeddings per node.

### Step 4 – Index with BGE-M3 + sparse terms

- **Current state**: All embeddings use OpenAI `text-embedding-3-small` (1536-dim dense only). Qdrant collections are configured for a single dense vector.
- **Needed changes**:
  - Swap or augment embeddings with BGE-M3 outputs (1024-dim dense + sparse lexical + multi-vector). We can attempt to run BGE-M3 locally via `@xenova/transformers` (already a dependency) but the 1.8 GB model may exceed Vercel/Firebase limits; hosting a GPU/CPU worker service is safer.
  - Recreate Qdrant collections to support multi-vector and sparse payloads (`vectors: { dense: {...}, multi: {...} }`, plus `sparse_vectors`). Confirm the managed Qdrant cluster version supports this and that `@qdrant/js-client-rest` exposes the relevant API fields.
  - Store sparse term maps in Qdrant payload or the native sparse field so we can run hybrid recall without calling Typesense separately.
- **Feasibility**: Requires infra updates (new embedding service + Qdrant schema migration). Work is significant but manageable.

### Step 5 – HyDE → hybrid recall → Cohere Rerank-v3.5

- **HyDE**: We can generate hypothetical answers with the existing OpenAI/Gemini clients. Needs prompt design, caching, and guardrails to avoid latency spikes.
- **Hybrid recall k=50**:
  - Use Qdrant’s new `search`/`search_batch` with both dense and sparse vectors. We may also fan out to Typesense (keyword) and merge results manually if the Qdrant sparse API is insufficient.
  - Need to filter to the “current paper” (already done) and optionally to specific section types for targeted questions.
- **Cohere rerank v3.5**:
  - Requires adding the Cohere SDK + API key management. Evaluate TTFB because reranking k=50 to m=10 adds ~300–500 ms per query.
  - Need to package each candidate chunk with surrounding metadata for rerank scoring.
- **Feasibility**: Medium. Everything is API-driven, but cost and latency must be tested.

### Step 6 – Context assembly with neighbors + anchors

- **Current gap**: The system concatenates top chunks verbatim and loses adjacency.
- **Needed work**:
  - Extend each chunk payload to include neighbor IDs, page numbers, section path, figure/equation references, and bounding boxes (from DocJSON).
  - After rerank, expand each winner by pulling neighbors from DocJSON or Qdrant (`scroll` or in-memory map) before building the final context window.
  - Compose a citation map (e.g., `[C1] -> paragraphId -> page 4, Figure 2`).
- **Feasibility**: Requires new helper library but uses existing Firebase/Qdrant data.

### Step 7 – Grounded generation + Self-RAG loop

- **Current state**: Single-pass generation with a generic prompt.
- **Needed changes**:
  - Design a grounding-aware prompt template (structured context table + instructions to cite `[C#]` tokens).
  - Implement a Self-RAG loop: run a verifier (could be a lightweight LLM call) that checks whether each answer sentence is supported by retrieved evidence. If confidence is low, trigger an additional retrieval pass (maybe expand k or force figure/table search).
  - Track span-to-citation alignment so we can highlight the exact support later.
- **Feasibility**: Prompting work + extra LLM calls. Needs careful cost budgeting but technically straightforward.

### Step 8 – Answer formatting with citations + Evidence block

- **Current gap**: `Source` only stores index/score/text and the UI ignores it.
- **Needed work**:
  - Extend `Source` to include `sectionPath`, `page`, `paragraphId`, `figureId`, `equationId`, and bounding boxes/Storage URLs for crops.
  - Update `app/api/chat/ask` (or the new service) to return structured citations plus an Evidence section containing short quotes + anchors.
  - Update the front-end chat components to render inline citation chips (clickable) and an Evidence panel.
- **Feasibility**: Pure TypeScript/React work once metadata exists.

### Step 9 – UI deep links to highlighted spans/figures

- **Starting point**: We already store annotation rectangles and know how to draw them in the PDF viewer. We also maintain PDF page DOM nodes and can scroll to a page when a user clicks “jump to highlight.”
- **Needed work**:
  - When the backend returns citations, include normalized rectangles (0–1 coords) or figure crop IDs. The UI can reuse `AnnotationLayer` to render transient highlights for AI citations.
  - For figure references, load the PDFFigures2 crop, overlay it as a tooltip or sidebar preview, and scroll the PDF to the figure’s page.
  - Ensure the Evidence block surfaces the same anchors (page, figure label, equation label) so the user can click through.
- **Feasibility**: High, provided Step 1 delivered bounding boxes. No additional infrastructure beyond storing figure crops in Firebase Storage/CDN.

## 3. Cross-Cutting Considerations

- **Job orchestration**: Running Docling + PDFFigures2 + RAPTOR will exceed Firebase Function limits. Plan on a dedicated ingestion pipeline (Cloud Run job, Supabase Edge Function with background workers, or a self-hosted service). Trigger it from the existing upload flow via Pub/Sub or Firestore state machine.
- **Data versioning/migrations**: Changing embeddings and Qdrant schema will require re-ingesting all papers. Plan for migration scripts and downtime windows.
- **Error handling + observability**: Introduce structured logging/tracing for each pipeline stage so we can debug why specific papers lack context.
- **Testing**: Create golden-paper fixtures (DocJSON samples + expected citations) to regression-test chunking, retrieval, reranking, and grounding logic.

## 4. Recommended Next Steps

1. **Decide on parsing stack + hosting** (Docling/Marker vs. managed service) and prototype DocJSON + PDFFigures2 outputs for a single paper.
2. **Design storage schemas** (DocJSON location, figure assets, Qdrant multi-vectors, Firestore metadata extensions).
3. **Prototype RAPTOR + BGE-M3 indexing** for one paper using a standalone script; validate Qdrant multi-vector performance.
4. **Implement the new query pipeline** (HyDE → hybrid recall → Cohere rerank → grounding) behind a feature flag so we can compare against the existing approach.
5. **Iterate on UI/UX** for citations and Evidence blocks, leveraging the existing annotation/highlight components for interactive spans.

With these building blocks in place, the requested RAG experience is achievable, but it requires a substantial investment in backend infrastructure, data modeling, and front-end visualization work.
