import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  setDoc, 
  deleteDoc,
  query, 
  where, 
  orderBy, 
  limit,
  Timestamp,
  DocumentReference,
  Query
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import type {
  UserProfile,
  LibraryEntry,
  UserUpload,
  Conversation,
  ConversationMessage,
  PaperRating,
  PaperComment,
  PaperMetadata,
  FeedEvent,
  FeedEventType
} from './types';

// User Profile Helpers
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const docRef = doc(db, `users/${userId}/profile/main`);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? (docSnap.data() as UserProfile) : null;
}

export async function createUserProfile(userId: string, data: Omit<UserProfile, 'createdAt' | 'updatedAt' | 'following' | 'followers' | 'favoriteCategories'>): Promise<void> {
  const docRef = doc(db, `users/${userId}/profile/main`);
  await setDoc(docRef, {
    ...data,
    following: [],
    followers: [],
    favoriteCategories: [],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

export async function updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
  const docRef = doc(db, `users/${userId}/profile/main`);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

// Library Helpers
export async function addToLibrary(userId: string, paperId: string, data?: Partial<LibraryEntry>): Promise<void> {
  const docRef = doc(db, `users/${userId}/library/${paperId}`);
  await setDoc(docRef, {
    paperId,
    addedAt: Timestamp.now(),
    lastRead: Timestamp.now(),
    readingProgress: 0,
    tags: [],
    ...data,
  });
}

export async function getLibraryEntry(userId: string, paperId: string): Promise<LibraryEntry | null> {
  const docRef = doc(db, `users/${userId}/library/${paperId}`);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? (docSnap.data() as LibraryEntry) : null;
}

export async function getUserLibrary(userId: string, limitCount: number = 50): Promise<LibraryEntry[]> {
  const q = query(
    collection(db, `users/${userId}/library`),
    orderBy('lastRead', 'desc'),
    limit(limitCount)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as LibraryEntry);
}

export async function updateLibraryEntry(userId: string, paperId: string, data: Partial<LibraryEntry>): Promise<void> {
  const docRef = doc(db, `users/${userId}/library/${paperId}`);
  await updateDoc(docRef, {
    ...data,
    lastRead: Timestamp.now(),
  });
}

// Conversation Helpers
export async function createConversation(userId: string, conversationId: string, data: Partial<Conversation>): Promise<void> {
  const docRef = doc(db, `users/${userId}/conversations/${conversationId}`);
  await setDoc(docRef, {
    title: data.title || 'New Conversation',
    paperIds: data.paperIds || [],
    memorySummary: data.memorySummary || '',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    settings: data.settings || { summaryLength: 'medium' },
  });
}

export async function getConversation(userId: string, conversationId: string): Promise<Conversation | null> {
  const docRef = doc(db, `users/${userId}/conversations/${conversationId}`);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? (docSnap.data() as Conversation) : null;
}

export async function updateConversation(userId: string, conversationId: string, data: Partial<Conversation>): Promise<void> {
  const docRef = doc(db, `users/${userId}/conversations/${conversationId}`);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

export async function getUserConversations(userId: string, limitCount: number = 20): Promise<Array<Conversation & { id: string }>> {
  const q = query(
    collection(db, `users/${userId}/conversations`),
    orderBy('updatedAt', 'desc'),
    limit(limitCount)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation & { id: string }));
}

// Conversation Message Helpers
export async function addMessage(userId: string, conversationId: string, message: Omit<ConversationMessage, 'id' | 'createdAt'>): Promise<string> {
  const messagesRef = collection(db, `users/${userId}/conversations/${conversationId}/messages`);
  const docRef = await addDoc(messagesRef, {
    ...message,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function getConversationMessages(userId: string, conversationId: string, limitCount: number = 50): Promise<Array<ConversationMessage>> {
  const q = query(
    collection(db, `users/${userId}/conversations/${conversationId}/messages`),
    orderBy('createdAt', 'asc'),
    limit(limitCount)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ConversationMessage));
}

// Paper Rating Helpers
export async function ratePaper(paperId: string, userId: string, rating: number): Promise<void> {
  const docRef = doc(db, `papers/${paperId}/ratings/${userId}`);
  const existing = await getDoc(docRef);
  
  if (existing.exists()) {
    await updateDoc(docRef, {
      rating,
      updatedAt: Timestamp.now(),
    });
  } else {
    await setDoc(docRef, {
      userId,
      rating,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }
  
  // Update paper metadata
  await updatePaperRatingStats(paperId);
}

export async function getUserRating(paperId: string, userId: string): Promise<number | null> {
  const docRef = doc(db, `papers/${paperId}/ratings/${userId}`);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? (docSnap.data() as PaperRating).rating : null;
}

export async function getPaperRatings(paperId: string): Promise<PaperRating[]> {
  const q = query(collection(db, `papers/${paperId}/ratings`));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as PaperRating);
}

async function updatePaperRatingStats(paperId: string): Promise<void> {
  const ratings = await getPaperRatings(paperId);
  const averageRating = ratings.length > 0
    ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
    : undefined;
  
  const metadataRef = doc(db, `papers/${paperId}/metadata/main`);
  await setDoc(metadataRef, {
    averageRating,
    ratingCount: ratings.length,
  }, { merge: true });
}

// Paper Comment Helpers
export async function addComment(paperId: string, userId: string, userName: string, content: string, parentId?: string): Promise<string> {
  const commentsRef = collection(db, `papers/${paperId}/comments`);
  const docRef = await addDoc(commentsRef, {
    userId,
    userName,
    content,
    parentId: parentId || null,
    upvotes: 0,
    downvotes: 0,
    votedBy: {},
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  
  // Update paper metadata comment count
  await updatePaperCommentCount(paperId);
  
  return docRef.id;
}

export async function getPaperComments(paperId: string): Promise<Array<PaperComment>> {
  const q = query(
    collection(db, `papers/${paperId}/comments`),
    orderBy('createdAt', 'desc')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaperComment));
}

export async function voteOnComment(paperId: string, commentId: string, userId: string, voteType: 'up' | 'down'): Promise<void> {
  const docRef = doc(db, `papers/${paperId}/comments/${commentId}`);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) return;
  
  const comment = docSnap.data() as PaperComment;
  const previousVote = comment.votedBy[userId];
  
  let upvotes = comment.upvotes;
  let downvotes = comment.downvotes;
  const votedBy = { ...comment.votedBy };
  
  // Remove previous vote
  if (previousVote === 'up') upvotes--;
  if (previousVote === 'down') downvotes--;
  
  // Add new vote if different from previous
  if (previousVote !== voteType) {
    if (voteType === 'up') upvotes++;
    if (voteType === 'down') downvotes++;
    votedBy[userId] = voteType;
  } else {
    // Toggle off if same vote
    delete votedBy[userId];
  }
  
  await updateDoc(docRef, {
    upvotes,
    downvotes,
    votedBy,
    updatedAt: Timestamp.now(),
  });
}

async function updatePaperCommentCount(paperId: string): Promise<void> {
  const q = query(collection(db, `papers/${paperId}/comments`));
  const querySnapshot = await getDocs(q);
  
  const metadataRef = doc(db, `papers/${paperId}/metadata/main`);
  await setDoc(metadataRef, {
    commentCount: querySnapshot.size,
  }, { merge: true });
}

// Paper Metadata Helpers
export async function getPaperMetadata(paperId: string): Promise<PaperMetadata | null> {
  const docRef = doc(db, `papers/${paperId}/metadata/main`);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? (docSnap.data() as PaperMetadata) : null;
}

export async function createOrUpdatePaperMetadata(paperId: string, data: Partial<PaperMetadata>): Promise<void> {
  const docRef = doc(db, `papers/${paperId}/metadata/main`);
  await setDoc(docRef, data, { merge: true });
}

export async function incrementPaperViewCount(paperId: string): Promise<void> {
  const docRef = doc(db, `papers/${paperId}/metadata/main`);
  const docSnap = await getDoc(docRef);
  
  const currentCount = docSnap.exists() ? (docSnap.data().viewCount || 0) : 0;
  
  await setDoc(docRef, {
    viewCount: currentCount + 1,
    lastViewed: Timestamp.now(),
  }, { merge: true });
}

// Feed Event Helpers
export async function createFeedEvent(
  userId: string,
  userName: string,
  eventType: FeedEventType,
  paperId: string,
  paperTitle: string,
  metadata?: any
): Promise<void> {
  const eventsRef = collection(db, 'feed_events');
  await addDoc(eventsRef, {
    userId,
    userName,
    eventType,
    paperId,
    paperTitle,
    metadata: metadata || null,
    createdAt: Timestamp.now(),
  });
}

export async function getFeedEvents(limitCount: number = 50): Promise<Array<FeedEvent>> {
  const q = query(
    collection(db, 'feed_events'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeedEvent));
}

export async function getUserFeedEvents(userId: string, limitCount: number = 50): Promise<Array<FeedEvent>> {
  const q = query(
    collection(db, 'feed_events'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeedEvent));
}

// Follow/Unfollow Helpers
export async function followUser(followerId: string, followingId: string): Promise<void> {
  // Update follower's following list
  const followerProfile = await getUserProfile(followerId);
  if (followerProfile && !followerProfile.following.includes(followingId)) {
    await updateUserProfile(followerId, {
      following: [...followerProfile.following, followingId],
    });
  }
  
  // Update following's followers list
  const followingProfile = await getUserProfile(followingId);
  if (followingProfile && !followingProfile.followers.includes(followerId)) {
    await updateUserProfile(followingId, {
      followers: [...followingProfile.followers, followerId],
    });
  }
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  // Update follower's following list
  const followerProfile = await getUserProfile(followerId);
  if (followerProfile) {
    await updateUserProfile(followerId, {
      following: followerProfile.following.filter(id => id !== followingId),
    });
  }
  
  // Update following's followers list
  const followingProfile = await getUserProfile(followingId);
  if (followingProfile) {
    await updateUserProfile(followingId, {
      followers: followingProfile.followers.filter(id => id !== followerId),
    });
  }
}
