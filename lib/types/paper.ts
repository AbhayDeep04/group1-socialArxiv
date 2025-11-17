import { Timestamp } from "firebase/firestore";

export type PaperSource = "arxiv" | "upload";
export type PaperVisibility = "private" | "unlisted" | "public";
export type PaperStatus = "uploading" | "uploaded" | "processing" | "ready" | "failed";

export interface Paper {
  id: string;
  source: PaperSource;
  ownerId: string | null;
  visibility: PaperVisibility;
  title: string;
  authors: string[];
  abstract: string;
  year: number | null;
  venue: string | null;
  tags: string[];
  status: PaperStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // Upload-specific fields
  storagePath?: string;
  fileName?: string;
  fileSize?: number;
  contentType?: string;
  md5Hash?: string | null;
  pageCount?: number | null;
  chunkCount?: number | null;
  embeddingModel?: string | null;
  processedAt?: Timestamp | null;
  errorMessage?: string | null;

  // ArXiv-specific fields
  arxivId?: string;
  url?: string;
}

export interface CreatePaperData {
  source: PaperSource;
  ownerId: string;
  visibility?: PaperVisibility;
  title: string;
  authors: string[];
  abstract: string;
  year?: number | null;
  venue?: string | null;
  tags?: string[];
  status: PaperStatus;
  
  // Upload-specific
  storagePath?: string;
  fileName?: string;
  fileSize?: number;
  contentType?: string;
}
