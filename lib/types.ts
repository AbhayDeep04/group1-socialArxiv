// Shared types for conversations and messages

export interface Source {
  index: number;
  chunkIndex: number;
  score: number;
  text: string;
  pageNumber?: number;
  bbox?: string; // JSON string of [x, y, w, h]
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  createdAt: Date;
}

export interface Conversation {
  id: string;
  userId: string;
  paperId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
  sources?: Source[];
}
