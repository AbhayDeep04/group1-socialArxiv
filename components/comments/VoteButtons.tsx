'use client';

import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VoteButtonsProps {
  commentId: string;
  paperId: string;
  initialScore: number;
  initialUpvotes: number;
  initialDownvotes: number;
  userVote: 1 | -1 | null;
  onVote: (value: 1 | -1 | 0) => Promise<void>;
  disabled?: boolean;
}

export function VoteButtons({
  commentId,
  paperId,
  initialScore,
  initialUpvotes,
  initialDownvotes,
  userVote: initialUserVote,
  onVote,
  disabled = false,
}: VoteButtonsProps) {
  const [score, setScore] = useState(initialScore);
  const [userVote, setUserVote] = useState<1 | -1 | null>(initialUserVote);
  const [isVoting, setIsVoting] = useState(false);

  useEffect(() => {
    setScore(initialScore);
    setUserVote(initialUserVote);
  }, [initialScore, initialUserVote]);

  const handleVote = async (value: 1 | -1) => {
    if (isVoting || disabled) return;

    const newVote = userVote === value ? 0 : value;
    const oldVote = userVote || 0;
    const scoreDelta = newVote - oldVote;

    const optimisticScore = score + scoreDelta;
    const optimisticUserVote = newVote === 0 ? null : newVote;

    setScore(optimisticScore);
    setUserVote(optimisticUserVote);
    setIsVoting(true);

    try {
      await onVote(newVote as 1 | -1 | 0);
    } catch (error) {
      setScore(score);
      setUserVote(userVote);
      console.error('Error voting:', error);
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-6 w-6 p-0',
          userVote === 1 && 'text-orange-500'
        )}
        onClick={() => handleVote(1)}
        disabled={isVoting || disabled}
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
      <span className={cn(
        'text-sm font-medium min-w-[2rem] text-center',
        score > 0 && 'text-orange-500',
        score < 0 && 'text-blue-500'
      )}>
        {score}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-6 w-6 p-0',
          userVote === -1 && 'text-blue-500'
        )}
        onClick={() => handleVote(-1)}
        disabled={isVoting || disabled}
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
