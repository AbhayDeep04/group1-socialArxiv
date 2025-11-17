'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, DocumentData, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import { CommentDoc, SortMode } from '@/lib/types/comments';
import { CommentItem } from './CommentItem';
import { useAuthUser } from '@/lib/hooks/useAuth';

interface CommentsListProps {
  paperId: string;
  sort: SortMode;
  onReply: (content: string, parentId: string) => Promise<void>;
  onEdit: (commentId: string, content: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onVote: (commentId: string, value: 1 | -1 | 0) => Promise<void>;
}

export function CommentsList({
  paperId,
  sort,
  onReply,
  onEdit,
  onDelete,
  onVote,
}: CommentsListProps) {
  const { user } = useAuthUser();
  const [comments, setComments] = useState<CommentDoc[]>([]);
  const [repliesMap, setRepliesMap] = useState<Map<string, CommentDoc[]>>(new Map());
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const commentsRef = collection(db, 'papers', paperId, 'comments');
    
    console.log('Client Firestore projectId:', db.app.options.projectId);
    console.log('Querying comments for paper:', paperId, 'sort:', sort);
    
    let q;
    if (sort === 'top') {
      q = query(
        commentsRef,
        where('depth', '==', 0),
        orderBy('score', 'desc'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    } else {
      q = query(
        commentsRef,
        where('depth', '==', 0),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('Top-level comments snapshot size:', snapshot.size);
      const commentsList: CommentDoc[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        console.log('Comment data:', doc.id, data);
        commentsList.push({
          id: doc.id,
          ...data,
        } as CommentDoc);
      });
      setComments(commentsList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching comments:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [paperId, sort]);

  const loadReplies = useCallback((parentId: string) => {
    if (loadingReplies.has(parentId) || repliesMap.has(parentId)) return;

    setLoadingReplies((prev) => new Set(prev).add(parentId));

    const commentsRef = collection(db, 'papers', paperId, 'comments');
    const q = query(
      commentsRef,
      where('parentId', '==', parentId),
      orderBy('createdAt', 'asc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const replies: CommentDoc[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        replies.push({
          id: doc.id,
          ...data,
        } as CommentDoc);
      });
      
      setRepliesMap((prev) => new Map(prev).set(parentId, replies));
      setLoadingReplies((prev) => {
        const newSet = new Set(prev);
        newSet.delete(parentId);
        return newSet;
      });
    }, (error) => {
      console.error('Error fetching replies for', parentId, error);
      setLoadingReplies((prev) => {
        const newSet = new Set(prev);
        newSet.delete(parentId);
        return newSet;
      });
    });

    return unsubscribe;
  }, [paperId, loadingReplies, repliesMap]);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading comments...</div>;
  }

  if (comments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No comments yet. Be the first to comment!
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          paperId={paperId}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onVote={onVote}
          replies={repliesMap.get(comment.id) || []}
          onLoadReplies={loadReplies}
          isLoadingReplies={loadingReplies.has(comment.id)}
        />
      ))}
    </div>
  );
}
