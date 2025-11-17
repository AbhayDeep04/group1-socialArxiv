'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import { useAuthUser } from './useAuth';

export function useCommentVote(paperId: string, commentId: string) {
  const { user } = useAuthUser();
  const [userVote, setUserVote] = useState<1 | -1 | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !paperId || !commentId) {
      setUserVote(null);
      setLoading(false);
      return;
    }

    const voteRef = doc(db, 'papers', paperId, 'comments', commentId, 'votes', user.uid);
    
    const unsubscribe = onSnapshot(voteRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setUserVote(data.value as 1 | -1);
      } else {
        setUserVote(null);
      }
      setLoading(false);
    }, (error) => {
      console.error('Error fetching vote:', error);
      setUserVote(null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, paperId, commentId]);

  return { userVote, loading };
}
