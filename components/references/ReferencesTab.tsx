'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink, FileText, BookOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ReferenceItem {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue?: string | null;
  doi?: string | null;
  arxivId?: string | null;
  urls?: {
    landing?: string;
    pdf?: string;
  };
  source: 'semanticscholar' | 'openalex';
}

interface ReferencesResponse {
  items: ReferenceItem[];
  total: number | null;
  nextOffset: number | null;
  sourceUsed: string;
}

interface ReferencesTabProps {
  paperId: string;
}

export function ReferencesTab({ paperId }: ReferencesTabProps) {
  const { user } = useAuth();
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [sourceUsed, setSourceUsed] = useState<string>('');

  useEffect(() => {
    async function fetchReferences() {
      if (!user || !paperId) return;

      setIsLoading(true);
      setError(null);

      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/papers/${paperId}/references?offset=0&limit=50`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to fetch references: ${response.status}`);
        }

        const data: ReferencesResponse = await response.json();
        setReferences(data.items || []);
        setTotal(data.total);
        setNextOffset(data.nextOffset);
        setSourceUsed(data.sourceUsed);
      } catch (err: any) {
        console.error('Error fetching references:', err);
        setError(err.message || 'Failed to load references');
      } finally {
        setIsLoading(false);
      }
    }

    fetchReferences();
  }, [paperId, user]);

  const loadMore = async () => {
    if (!user || !nextOffset) return;

    setIsLoadingMore(true);

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/papers/${paperId}/references?offset=${nextOffset}&limit=50`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load more references');
      }

      const data: ReferencesResponse = await response.json();
      setReferences((prev) => [...prev, ...(data.items || [])]);
      setNextOffset(data.nextOffset);
    } catch (err: any) {
      console.error('Error loading more references:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading references...</p>
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

  if (references.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No references found for this paper.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          {total !== null ? `${total} reference${total !== 1 ? 's' : ''}` : `${references.length} reference${references.length !== 1 ? 's' : ''}`}
        </span>
        <span className="text-xs">
          Source: {sourceUsed === 'semanticscholar' ? 'Semantic Scholar' : 'OpenAlex'}
        </span>
      </div>

      <div className="space-y-3">
        {references.map((ref, index) => (
          <Card key={`${ref.id}-${index}`} className="hover:bg-accent/50 transition-colors">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    {ref.urls?.landing ? (
                      <a
                        href={ref.urls.landing}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        <h3 className="font-medium text-sm line-clamp-2">
                          {ref.title}
                        </h3>
                      </a>
                    ) : (
                      <h3 className="font-medium text-sm line-clamp-2">
                        {ref.title}
                      </h3>
                    )}
                  </div>
                  {ref.urls?.landing && (
                    <a href={ref.urls.landing} target="_blank" rel="noopener noreferrer">
                      <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </div>

                {ref.authors.length > 0 && (
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {ref.authors.slice(0, 3).join(', ')}
                    {ref.authors.length > 3 && ` et al.`}
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  {ref.venue && (
                    <span className="text-xs text-muted-foreground">
                      {ref.venue}
                    </span>
                  )}
                  {ref.year && (
                    <span className="text-xs text-muted-foreground">
                      {ref.venue && '•'} {ref.year}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {ref.doi && (
                    <Badge variant="outline" className="text-xs">
                      DOI
                    </Badge>
                  )}
                  {ref.arxivId && (
                    <Badge variant="outline" className="text-xs">
                      arXiv
                    </Badge>
                  )}
                  {ref.urls?.pdf && (
                    <a href={ref.urls.pdf} target="_blank" rel="noopener noreferrer">
                      <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-secondary/80">
                        <FileText className="h-3 w-3 mr-1" />
                        PDF
                      </Badge>
                    </a>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {nextOffset !== null && (
        <div className="flex justify-center pt-2">
          <Button
            onClick={loadMore}
            disabled={isLoadingMore}
            variant="outline"
            size="sm"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
