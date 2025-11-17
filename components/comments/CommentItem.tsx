'use client';

import { useState } from 'react';
import { MessageSquare, Edit2, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { VoteButtons } from './VoteButtons';
import { CommentForm } from './CommentForm';
import { CommentDoc } from '@/lib/types/comments';
import { formatDistanceToNow } from 'date-fns';
import { useAuthUser } from '@/lib/hooks/useAuth';
import { useCommentVote } from '@/lib/hooks/useCommentVote';

interface CommentItemProps {
  comment: CommentDoc;
  paperId: string;
  onReply: (content: string, parentId: string) => Promise<void>;
  onEdit: (commentId: string, content: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onVote: (commentId: string, value: 1 | -1 | 0) => Promise<void>;
  replies?: CommentDoc[];
  onLoadReplies?: (commentId: string) => void;
  isLoadingReplies?: boolean;
}

export function CommentItem({
  comment,
  paperId,
  onReply,
  onEdit,
  onDelete,
  onVote,
  replies = [],
  onLoadReplies,
  isLoadingReplies = false,
}: CommentItemProps) {
  const { user } = useAuthUser();
  const { userVote } = useCommentVote(paperId, comment.id);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showReplies, setShowReplies] = useState(false);

  const isAuthor = user?.uid === comment.author.uid;
  const hasReplies = comment.replyCount > 0;

  const handleReply = async (content: string) => {
    await onReply(content, comment.id);
    setShowReplyForm(false);
  };

  const handleEdit = async () => {
    if (!editContent.trim() || isEditing) return;
    setIsEditing(true);
    try {
      await onEdit(comment.id, editContent.trim());
      setShowEditForm(false);
    } catch (error) {
      console.error('Error editing comment:', error);
    } finally {
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this comment?')) return;
    setIsDeleting(true);
    try {
      await onDelete(comment.id);
    } catch (error) {
      console.error('Error deleting comment:', error);
      setIsDeleting(false);
    }
  };

  const handleToggleReplies = () => {
    if (!showReplies && onLoadReplies && replies.length === 0) {
      onLoadReplies(comment.id);
    }
    setShowReplies(!showReplies);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (comment.deleted) {
    return (
      <div className="flex gap-3 text-muted-foreground text-sm py-2">
        <div className="flex-1">
          [deleted]
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center gap-2">
        <Avatar className="h-8 w-8">
          <AvatarImage src={comment.author.photoURL} />
          <AvatarFallback>{getInitials(comment.author.displayName)}</AvatarFallback>
        </Avatar>
        {hasReplies && (
          <div className="w-0.5 flex-1 bg-border" />
        )}
      </div>

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{comment.author.displayName}</span>
          <span className="text-muted-foreground">
            {formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: true })}
          </span>
          {comment.edited && (
            <span className="text-muted-foreground text-xs">(edited)</span>
          )}
        </div>

        {showEditForm ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full min-h-[80px] p-2 border rounded-md"
              disabled={isEditing}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleEdit} disabled={isEditing}>
                {isEditing ? 'Saving...' : 'Save'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowEditForm(false);
                  setEditContent(comment.content);
                }}
                disabled={isEditing}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
        )}

        <div className="flex items-center gap-4">
          <VoteButtons
            commentId={comment.id}
            paperId={paperId}
            initialScore={comment.score}
            initialUpvotes={comment.upvoteCount}
            initialDownvotes={comment.downvoteCount}
            userVote={userVote}
            onVote={(value) => onVote(comment.id, value)}
            disabled={!user}
          />

          {user && !showEditForm && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setShowReplyForm(!showReplyForm)}
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                Reply
              </Button>

              {isAuthor && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setShowEditForm(true)}
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-red-500 hover:text-red-600"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </>
              )}
            </>
          )}

          {hasReplies && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={handleToggleReplies}
            >
              {showReplies ? (
                <ChevronDown className="h-3 w-3 mr-1" />
              ) : (
                <ChevronRight className="h-3 w-3 mr-1" />
              )}
              {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
            </Button>
          )}
        </div>

        {showReplyForm && (
          <div className="mt-2">
            <CommentForm
              paperId={paperId}
              parentId={comment.id}
              onSubmit={handleReply}
              onCancel={() => setShowReplyForm(false)}
              placeholder="Write a reply..."
              submitLabel="Reply"
            />
          </div>
        )}

        {showReplies && (
          <div className="mt-4 space-y-4 pl-4 border-l-2">
            {isLoadingReplies ? (
              <div className="text-sm text-muted-foreground">Loading replies...</div>
            ) : (
              replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  paperId={paperId}
                  onReply={onReply}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onVote={onVote}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
