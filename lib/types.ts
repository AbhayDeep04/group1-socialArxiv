import { Timestamp } from 'firebase/firestore';

// User Profile
export interface UserProfile {
  displayName: string;
  email: string;
  bio?: string;
  avatarUrl?: string;
  following: string[];
  followers: string[];
  favoriteCategories: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// User Library Entry
export interface LibraryEntry {
  paperId: string;
  addedAt: Timestamp;
  lastRead: Timestamp;
  readingProgress: number;
  personalRating?: number;
  personalNotes?: string;
  tags: string[];
}

// User Upload
export interface UserUpload {
  id: string;
  fileName: string;
  title: string;
  authors: string[];
  year?: number;
  abstract?: string;
  pdfUrl: string;
  uploadedAt: Timestamp;
  fileSize: number;
  pageCount?: number;
}

// Conversation Settings
export interface ConversationSettings {
  summaryLength: 'short' | 'medium' | 'long';
  topK?: number;
}

// Conversation
export interface Conversation {
  title: string;
  paperIds: string[];
  memorySummary: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  settings: ConversationSettings;
}

// Citation Data
export interface Citation {
  sid: string;
  chunkId: string;
  paperId: string;
  title: string;
  pageStart: number;
  pageEnd: number;
  textSnippet: string;
  score: number;
}

// Conversation Message
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'event';
  content: string;
  citations: Citation[];
  tokensIn?: number;
  tokensOut?: number;
  createdAt: Timestamp;
  eventType?: 'add_papers';
}

// Paper Rating
export interface PaperRating {
  userId: string;
  rating: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Paper Comment
export interface PaperComment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  parentId?: string;
  upvotes: number;
  downvotes: number;
  votedBy: { [userId: string]: 'up' | 'down' };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Paper Metadata
export interface PaperMetadata {
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
  lastViewed: Timestamp;
}

// Feed Event
export type FeedEventType = 'read' | 'rated' | 'commented' | 'uploaded';

export interface FeedEvent {
  id: string;
  userId: string;
  userName: string;
  eventType: FeedEventType;
  paperId: string;
  paperTitle: string;
  metadata?: any;
  createdAt: Timestamp;
}

// Retrieved Chunk from Qdrant
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

// Paper Document (from Typesense search)
export interface PaperDocument {
  id: string;
  title: string;
  abstract: string;
  authors: string | string[];
  year: number;
  categories: string[];
  pdfUrl: string;
  source: string;
}
