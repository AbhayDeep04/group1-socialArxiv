'use client';

import { use, useEffect, useState } from 'react';
import { useAuthUser } from '@/lib/hooks/useAuth';
import { getProfile, getFollowers, getFollowing } from '@/lib/profile';
import { getBookmarkedPaperIds } from '@/lib/firestore/bookmarks';
import { UserAvatar } from '@/components/user-avatar';
import { FollowButton } from '@/components/follow-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { MapPin, Building2, Users, UserCheck, Edit } from 'lucide-react';
import type { UserProfile } from '@/lib/types/profile';
import type { Paper } from '@/lib/types/paper';
import Link from 'next/link';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';

export default function ProfilePage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = use(params);
  const { user } = useAuthUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pinnedPapers, setPinnedPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [followersList, setFollowersList] = useState<string[]>([]);
  const [followingList, setFollowingList] = useState<string[]>([]);

  const isOwnProfile = user?.uid === uid;

  useEffect(() => {
    async function loadProfile() {
      try {
        const profileData = await getProfile(uid);
        setProfile(profileData);

        if (profileData?.pinnedPaperIds && profileData.pinnedPaperIds.length > 0) {
          const papersRef = collection(db, 'papers');
          const q = query(papersRef, where(documentId(), 'in', profileData.pinnedPaperIds));
          const snapshot = await getDocs(q);
          const papers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Paper));
          setPinnedPapers(papers);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [uid]);

  const loadFollowers = async () => {
    const followers = await getFollowers(uid);
    setFollowersList(followers);
  };

  const loadFollowing = async () => {
    const following = await getFollowing(uid);
    setFollowingList(following);
  };

  if (loading) {
    return (
      <div className="container py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-muted-foreground">Profile not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-4xl">
      <div className="flex flex-col gap-6">
        <div className="flex items-start gap-6">
          <UserAvatar user={{ displayName: profile.displayName, photoURL: profile.photoURL }} size={120} />
          
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-3xl font-bold">{profile.displayName}</h1>
              {isOwnProfile ? (
                <Link href="/profile/settings">
                  <Button variant="outline" size="sm">
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Profile
                  </Button>
                </Link>
              ) : (
                <FollowButton targetUid={uid} />
              )}
            </div>

            <div className="flex gap-6 mb-4">
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    className="text-sm hover:underline"
                    onClick={loadFollowers}
                  >
                    <span className="font-semibold">{profile.followerCount}</span> followers
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Followers</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    {followersList.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No followers yet</p>
                    ) : (
                      followersList.map(followerId => (
                        <Link key={followerId} href={`/u/${followerId}`}>
                          <div className="p-2 hover:bg-accent rounded">{followerId}</div>
                        </Link>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger asChild>
                  <button
                    className="text-sm hover:underline"
                    onClick={loadFollowing}
                  >
                    <span className="font-semibold">{profile.followingCount}</span> following
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Following</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    {followingList.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Not following anyone yet</p>
                    ) : (
                      followingList.map(followingId => (
                        <Link key={followingId} href={`/u/${followingId}`}>
                          <div className="p-2 hover:bg-accent rounded">{followingId}</div>
                        </Link>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {profile.bio && (
              <p className="text-muted-foreground mb-3">{profile.bio}</p>
            )}

            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              {profile.institution && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  <span>{profile.institution}</span>
                </div>
              )}
              {profile.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>{profile.location}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {pinnedPapers.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Pinned Papers</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pinnedPapers.map((paper) => (
                <Card key={paper.id}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      <Link href={`/papers/${paper.id}`} className="hover:underline">
                        {paper.title}
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {paper.abstract}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {paper.authors.slice(0, 3).join(', ')}
                      {paper.authors.length > 3 && ' et al.'}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
