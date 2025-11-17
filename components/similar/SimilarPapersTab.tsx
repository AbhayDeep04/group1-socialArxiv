'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink, Calendar, Tag } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SimilarPaper {
  paperId: string;
  title: string;
  abstract: string;
  categories: string[];
  year: number;
  score: number;
}

interface SimilarPapersTabProps {
  paperId: string;
}

export function SimilarPapersTab({ paperId }: SimilarPapersTabProps) {
  const { user } = useAuth();
  const [papers, setPapers] = useState<SimilarPaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<'all' | 'recent'>('all');

  useEffect(() => {
    async function fetchSimilarPapers() {
      if (!user || !paperId) return;

      setIsLoading(true);
      setError(null);

      try {
        const token = await user.getIdToken();
        const currentYear = new Date().getFullYear();
        const yearGte = yearFilter === 'recent' ? currentYear - 3 : undefined;
        
        const params = new URLSearchParams({
          limit: '10',
          ...(yearGte && { year_gte: yearGte.toString() }),
        });

        const response = await fetch(`/api/papers/${paperId}/similar?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to fetch similar papers: ${response.status}`);
        }

        const data = await response.json();
        setPapers(data.results || []);
      } catch (err: any) {
        console.error('Error fetching similar papers:', err);
        setError(err.message || 'Failed to load similar papers');
      } finally {
        setIsLoading(false);
      }
    }

    fetchSimilarPapers();
  }, [paperId, user, yearFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Finding similar papers...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <p className="text-sm text-red-600 mb-3">{error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (papers.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No similar papers found.</p>
          {yearFilter === 'recent' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setYearFilter('all')}
              className="mt-3"
            >
              Show all papers
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter Toggle */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={yearFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setYearFilter('all')}
        >
          All Time
        </Button>
        <Button
          size="sm"
          variant={yearFilter === 'recent' ? 'default' : 'outline'}
          onClick={() => setYearFilter('recent')}
        >
          Recent (Last 3 Years)
        </Button>
      </div>

      {/* Papers List */}
      <div className="space-y-3">
        {papers.map((paper) => (
          <Card key={paper.paperId} className="hover:bg-accent/50 transition-colors">
            <CardContent className="p-4">
              <div className="space-y-2">
                {/* Title and Link */}
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/paper/${paper.paperId}`}
                    className="flex-1 hover:underline"
                  >
                    <h3 className="font-medium text-sm line-clamp-2">
                      {paper.title}
                    </h3>
                  </Link>
                  <Link href={`/paper/${paper.paperId}`}>
                    <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>

                {/* Abstract */}
                <p className="text-xs text-muted-foreground line-clamp-3">
                  {paper.abstract}
                </p>

                {/* Metadata */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{paper.year}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    <span className="line-clamp-1">
                      {paper.categories.slice(0, 2).join(', ')}
                      {paper.categories.length > 2 && ` +${paper.categories.length - 2}`}
                    </span>
                  </div>
                  <div className="ml-auto">
                    <Badge variant="secondary" className="text-xs">
                      {(paper.score * 100).toFixed(0)}% match
                    </Badge>
                  </div>
                </div>

                {/* Categories */}
                <div className="flex flex-wrap gap-1">
                  {paper.categories.slice(0, 3).map((cat) => (
                    <Badge key={cat} variant="outline" className="text-xs">
                      {cat}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
