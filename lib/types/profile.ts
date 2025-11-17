import { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  displayName: string;
  bio: string;
  institution: string;
  location: string;
  pinnedPaperIds: string[];
  followerCount: number;
  followingCount: number;
  searchName: string;
  searchInstitution: string;
  photoURL?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FollowRelation {
  createdAt: Timestamp;
}

export interface UserSearchResult {
  uid: string;
  displayName: string;
  bio: string;
  institution: string;
  location: string;
  photoURL?: string;
  followerCount: number;
  followingCount: number;
}
