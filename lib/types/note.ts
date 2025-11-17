import { Timestamp } from 'firebase/firestore';

export interface Rect {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Anchors {
  prefix?: string;
  exact: string;
  suffix?: string;
}

export interface Annotation {
  quote: string;
  color: string;
  pageRects: Rect[];
  anchors?: Anchors;
}

export interface Note {
  id: string;
  userId: string;
  paperId: string;
  type: 'general' | 'annotation';
  content: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  annotation?: Annotation;
}

export interface CreateGeneralNoteData {
  content: string;
}

export interface CreateAnnotationNoteData {
  content: string;
  quote: string;
  color: string;
  pageRects: Rect[];
  anchors?: Anchors;
}

export interface UpdateNoteData {
  content?: string;
  updatedAt?: Timestamp;
}
