import { db } from '@/lib/firebaseConfig';
import { doc, onSnapshot } from 'firebase/firestore';

export interface UserRating {
  value: number;
  createdAt: any;
  updatedAt: any;
}

export interface RatingAggregate {
  averageRounded: number;
  count: number;
}

export function subscribeToUserRating(
  uid: string,
  paperId: string,
  callback: (rating: UserRating | null) => void
): () => void {
  const ratingRef = doc(db, 'users', uid, 'ratings', paperId);
  
  const unsubscribe = onSnapshot(
    ratingRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as UserRating);
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error('Error subscribing to user rating:', error);
      callback(null);
    }
  );

  return unsubscribe;
}

export async function submitRating(
  paperId: string,
  value: number,
  idToken: string
): Promise<{ averageRounded: number; count: number; userValue: number }> {
  const response = await fetch(`/api/papers/${paperId}/rating`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ value }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to submit rating');
  }

  return response.json();
}

export async function fetchRatingAverages(
  paperIds: string[]
): Promise<Record<string, RatingAggregate | null>> {
  if (paperIds.length === 0) {
    return {};
  }

  const response = await fetch(`/api/ratings/averages?ids=${paperIds.join(',')}`);

  if (!response.ok) {
    console.error('Failed to fetch rating averages');
    return {};
  }

  return response.json();
}
