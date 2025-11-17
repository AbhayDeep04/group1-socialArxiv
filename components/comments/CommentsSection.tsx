'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CommentForm } from './CommentForm';
import { CommentsList } from './CommentsList';
import { useAuthUser } from '@/lib/hooks/useAuth';
import { SortMode } from '@/lib/types/comments';

interface CommentsSectionProps {
  paperId: string;
}

export function CommentsSection({ paperId }: CommentsSectionProps) {
  const { user, loading } = useAuthUser();
  const [sort, setSort] = useState<SortMode>('top');

  const getAuthToken = async () => {
    if (!user) throw new Error('Not authenticated');
    return await user.getIdToken();
  };

  const handleCreateComment = async (content: string) => {
    const token = await getAuthToken();
    const response = await fetch(`/api/papers/${paperId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create comment');
    }
  };

  const handleReply = async (content: string, parentId: string) => {
    const token = await getAuthToken();
    const response = await fetch(`/api/papers/${paperId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content, parentId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create reply');
    }
  };

  const handleEdit = async (commentId: string, content: string) => {
    const token = await getAuthToken();
    const response = await fetch(`/api/papers/${paperId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to edit comment');
    }
  };

  const handleDelete = async (commentId: string) => {
    const token = await getAuthToken();
    const response = await fetch(`/api/papers/${paperId}/comments/${commentId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete comment');
    }
  };

  const handleVote = async (commentId: string, value: 1 | -1 | 0) => {
    const token = await getAuthToken();
    const response = await fetch(`/api/papers/${paperId}/comments/${commentId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to vote');
    }

    return await response.json();
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">Community Comments</h2>
      <Separator className="mb-6" />

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : user ? (
        <div className="space-y-6">
          <CommentForm
            paperId={paperId}
            onSubmit={handleCreateComment}
            placeholder="Share your thoughts on this paper..."
            submitLabel="Post Comment"
          />
          <Separator />
        </div>
      ) : (
        <div className="mb-6 p-4 border rounded-lg bg-muted/50 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Sign in to join the discussion
          </p>
          <div className="flex gap-2 justify-center">
            <Link href="/login">
              <Button size="sm">Login</Button>
            </Link>
            <Link href="/register">
              <Button size="sm" variant="outline">Register</Button>
            </Link>
          </div>
        </div>
      )}

      <Tabs value={sort} onValueChange={(v) => setSort(v as SortMode)} className="mt-6">
        <TabsList>
          <TabsTrigger value="top">Top</TabsTrigger>
          <TabsTrigger value="new">New</TabsTrigger>
        </TabsList>
        <TabsContent value={sort} className="mt-6">
          <CommentsList
            paperId={paperId}
            sort={sort}
            onReply={handleReply}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onVote={handleVote}
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
