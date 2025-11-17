# Agent Guidelines for SocialArxiv

## Commands
- **Dev**: `npm run dev` (starts Next.js dev server on port 3000)
- **Build**: `npm run build` (checks types and builds production)
- **Lint**: `npm run lint` (runs ESLint)
- **Test**: `npm run test` (runs Jest tests)
- **Ingest**: `node scripts/ingest.mjs` (ingest demo papers - run from project root)

## Architecture
- **Framework**: Next.js 16 with App Router, React 19, TypeScript (strict mode)
- **Structure**: `/app` (pages, API routes), `/components` (UI components), `/lib` (utilities, config, types), `/scripts` (data ingestion)
- **APIs**: `/app/api/auth`, `/app/api/papers`, `/app/api/chat`, `/app/api/conversations` (Next.js Route Handlers)
- **Search**: Typesense (keyword search), Qdrant (vector/semantic search with RAG)
- **Database**: Firebase Firestore (conversations, messages with multi-turn chat history)
- **RAG**: Proper semantic search using Qdrant with Xenova/all-MiniLM-L6-v2 embeddings (top-k retrieval, not full document)
- **Auth**: Firebase Authentication
- **Styling**: Tailwind CSS v4 with shadcn/ui components

## Code Style
- Use `'use client'` directive for client components
- Import paths: `@/` prefix (e.g., `@/components/ui/button`, `@/lib/utils`)
- Types: Explicit interface definitions for data (e.g., `PaperDocument`), React.ComponentProps for component props
- UI: shadcn/ui components in `/components/ui`, use `cn()` helper from `@/lib/utils` for className merging
- Formatting: ES2017, functional components, React hooks patterns
- Env vars: `NEXT_PUBLIC_*` for client-side, plain names for server-side (see README for required vars)
