'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface RatingPopoverProps {
  paperId: string;
  currentRating: number | null;
  disabled?: boolean;
  onRate: (value: number) => Promise<void>;
}

export function RatingPopover({ paperId, currentRating, disabled, onRate }: RatingPopoverProps) {
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleRate = async (value: number) => {
    if (disabled || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await onRate(value);
      setOpen(false);
    } catch (error) {
      console.error('Failed to submit rating:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayRating = hoveredStar ?? currentRating ?? 0;

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setHoveredStar(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              disabled={disabled}
              className="h-8 w-8"
            >
              {currentRating ? (
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              ) : (
                <Star className="h-4 w-4" />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{currentRating ? `Your rating: ${currentRating}★` : 'Rate this paper'}</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto p-3">
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {currentRating ? `Your rating: ${currentRating}★` : 'Rate this paper'}
          </p>
          <div
            className="flex gap-1"
            onMouseLeave={() => setHoveredStar(null)}
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                disabled={isSubmitting}
                onMouseEnter={() => setHoveredStar(star)}
                onClick={() => handleRate(star)}
                className="transition-transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Star
                  className={`h-8 w-8 ${
                    star <= displayRating
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>
          {currentRating && (
            <p className="text-xs text-muted-foreground text-center">
              Click to change your rating
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
