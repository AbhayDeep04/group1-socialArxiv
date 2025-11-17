import { Timestamp } from 'firebase/firestore';

export interface CommentAuthor {
  uid: string;
  displayName: string;
  photoURL?: string;
}

export interface CommentDoc {
  id: string;
  paperId: string;
  parentId: string | null;
  rootId: string | null;
  path: string[];
  depth: number;
  author: CommentAuthor;
  content: string;
  upvoteCount: number;
  downvoteCount: number;
  score: number;
  replyCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  edited: boolean;
  deleted: boolean;
}

export interface VoteDoc {
  uid: string;
  value: 1 | -1;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SortMode = 'top' | 'new';

export interface CreateCommentRequest {
  parentId?: string | null;
  content: string;
}

export interface UpdateCommentRequest {
  content: string;
}

export interface VoteRequest {
  value: 1 | -1 | 0;
}

export interface VoteResponse {
  upvoteCount: number;
  downvoteCount: number;
  score: number;
  userVote: 1 | -1 | null;
}
