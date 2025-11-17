import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';

export async function toggleBookmark(userId: string, paperId: string): Promise<boolean> {
  const bookmarkRef = doc(db, `users/${userId}/bookmarks/${paperId}`);
  const bookmarkSnap = await getDoc(bookmarkRef);
  
  if (bookmarkSnap.exists()) {
    await deleteDoc(bookmarkRef);
    return false;
  } else {
    await setDoc(bookmarkRef, {
      paperId,
      createdAt: serverTimestamp(),
    });
    return true;
  }
}

export function subscribeToBookmark(
  userId: string,
  paperId: string,
  callback: (isBookmarked: boolean) => void
): Unsubscribe {
  const bookmarkRef = doc(db, `users/${userId}/bookmarks/${paperId}`);
  return onSnapshot(bookmarkRef, (snap) => {
    callback(snap.exists());
  });
}

export async function getBookmarkedPaperIds(userId: string, limitCount = 50): Promise<string[]> {
  const bookmarksRef = collection(db, `users/${userId}/bookmarks`);
  const q = query(bookmarksRef, orderBy('createdAt', 'desc'), limit(limitCount));
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.id);
}
