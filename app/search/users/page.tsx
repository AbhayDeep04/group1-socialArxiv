'use client';

import { useState, useCallback } from 'react';
import { searchUsers } from '@/lib/profile';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { FollowButton } from '@/components/follow-button';
import { Building2, MapPin, Search } from 'lucide-react';
import Link from 'next/link';
import type { UserSearchResult } from '@/lib/types/profile';
import { debounce } from 'lodash';

export default function UserSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const performSearch = useCallback(
    debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const searchResults = await searchUsers(searchQuery);
        setResults(searchResults);
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  const handleSearchChange = (value: string) => {
    setQuery(value);
    performSearch(value);
  };

  return (
    <div className="container py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Search Users</h1>

      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by name..."
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <p className="text-muted-foreground">Searching...</p>
        </div>
      )}

      {!loading && query && results.length === 0 && (
        <div className="flex justify-center py-8">
          <p className="text-muted-foreground">No users found</p>
        </div>
      )}

      <div className="space-y-4">
        {results.map((user) => (
          <Card key={user.uid}>
            <CardHeader>
              <div className="flex items-start gap-4">
                <Link href={`/u/${user.uid}`}>
                  <UserAvatar
                    user={{ displayName: user.displayName, photoURL: user.photoURL }}
                    size={64}
                  />
                </Link>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <Link href={`/u/${user.uid}`}>
                      <h3 className="text-lg font-semibold hover:underline">
                        {user.displayName}
                      </h3>
                    </Link>
                    <FollowButton targetUid={user.uid} variant="outline" />
                  </div>

                  {user.bio && (
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                      {user.bio}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    {user.institution && (
                      <div className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        <span>{user.institution}</span>
                      </div>
                    )}
                    {user.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>{user.location}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-semibold">{user.followerCount}</span> followers
                    </div>
                    <div>
                      <span className="font-semibold">{user.followingCount}</span> following
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
