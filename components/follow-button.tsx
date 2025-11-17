'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAuthUser } from '@/lib/hooks/useAuth';
import { subscribeToFollowStatus, followUser, unfollowUser } from '@/lib/profile';
import { useRouter } from 'next/navigation';

interface FollowButtonProps {
  targetUid: string;
  variant?: 'default' | 'outline';
}

export function FollowButton({ targetUid, variant = 'default' }: FollowButtonProps) {
  const { user } = useAuthUser();
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user || user.uid === targetUid) return;

    const unsubscribe = subscribeToFollowStatus(user.uid, targetUid, setIsFollowing);
    return () => unsubscribe();
  }, [user, targetUid]);

  const handleClick = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (user.uid === targetUid) return;

    setIsLoading(true);
    try {
      if (isFollowing) {
        await unfollowUser(targetUid);
      } else {
        await followUser(targetUid);
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user || user.uid === targetUid) {
    return null;
  }

  return (
    <Button
      variant={isFollowing ? 'outline' : variant}
      onClick={handleClick}
      disabled={isLoading}
    >
      {isLoading ? 'Loading...' : isFollowing ? 'Following' : 'Follow'}
    </Button>
  );
}
