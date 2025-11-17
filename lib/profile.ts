import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  Unsubscribe,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebaseConfig';
import type { UserProfile, UserSearchResult } from '@/lib/types/profile';

export async function getProfile(uid: string): Promise<UserProfile | null> {
  const profileRef = doc(db, 'profiles', uid);
  const profileSnap = await getDoc(profileRef);
  
  if (!profileSnap.exists()) {
    return null;
  }
  
  return { uid, ...profileSnap.data() } as UserProfile;
}

export function subscribeToProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void
): Unsubscribe {
  const profileRef = doc(db, 'profiles', uid);
  return onSnapshot(profileRef, (snap) => {
    if (snap.exists()) {
      callback({ uid, ...snap.data() } as UserProfile);
    } else {
      callback(null);
    }
  });
}

export function subscribeToFollowStatus(
  myUid: string,
  targetUid: string,
  callback: (isFollowing: boolean) => void
): Unsubscribe {
  const followingRef = doc(db, `profiles/${myUid}/following/${targetUid}`);
  return onSnapshot(followingRef, (snap) => {
    callback(snap.exists());
  });
}

export async function followUser(targetUid: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  
  const token = await user.getIdToken();
  const response = await fetch(`/api/profiles/${targetUid}/follow`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Failed to follow user');
  }
}

export async function unfollowUser(targetUid: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  
  const token = await user.getIdToken();
  const response = await fetch(`/api/profiles/${targetUid}/follow`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Failed to unfollow user');
  }
}

export async function updatePinnedPapers(paperIds: string[]): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  
  const token = await user.getIdToken();
  const response = await fetch('/api/profiles/pins', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pinnedPaperIds: paperIds }),
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Failed to update pinned papers');
  }
}

export async function updateProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'bio' | 'institution' | 'location'>>
): Promise<void> {
  const profileRef = doc(db, 'profiles', uid);
  
  const updateData: Record<string, unknown> = {
    ...updates,
    updatedAt: serverTimestamp(),
  };
  
  if (updates.displayName) {
    updateData.searchName = updates.displayName.toLowerCase();
  }
  
  if (updates.institution) {
    updateData.searchInstitution = updates.institution.toLowerCase();
  }
  
  await updateDoc(profileRef, updateData);
}

export async function searchUsers(
  searchQuery: string,
  limitCount = 20
): Promise<UserSearchResult[]> {
  const response = await fetch(
    `/api/users/search?query=${encodeURIComponent(searchQuery)}&limit=${limitCount}`
  );
  
  if (!response.ok) {
    throw new Error('Failed to search users');
  }
  
  const data = await response.json();
  return data.results;
}

export async function getFollowers(
  uid: string,
  limitCount = 50
): Promise<string[]> {
  const followersRef = collection(db, `profiles/${uid}/followers`);
  const q = query(followersRef, orderBy('createdAt', 'desc'), limit(limitCount));
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.id);
}

export async function getFollowing(
  uid: string,
  limitCount = 50
): Promise<string[]> {
  const followingRef = collection(db, `profiles/${uid}/following`);
  const q = query(followingRef, orderBy('createdAt', 'desc'), limit(limitCount));
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.id);
}
