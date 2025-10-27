'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Typesense from 'typesense';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, RotateCcw, Minus } from "lucide-react";

// --- Typesense Client Initialization (Can optionally be removed if initial load uses API) ---
// Keep this only if you want the initial load separate from search API
const typesenseClient = new Typesense.Client({
    nodes: [{
        host: process.env.NEXT_PUBLIC_TYPESENSE_HOST || '', // Use env var
        port: parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT || '443', 10), // Use env var
        protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || 'https', // Use env var
    }],
    // Use the SEARCH ONLY key for client-side fetching
    apiKey: process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY || '', // Use env var
    connectionTimeoutSeconds: 5, // Shorter timeout for client-side
});

// Define an interface for the paper data structure (matching Typesense fields)
interface PaperDocument {
  id: string; // Document ID from Typesense (same as our paperId)
  title: string;
  abstract: string;
  authors: string[];
  year: number;
  pdfUrl: string;
  categories?: string[]; // Optional fields
  source?: string;
}
interface PaperHit { // Needed if using client-side Typesense directly
  document: PaperDocument;
}


export default function HomePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [papers, setPapers] = useState<PaperDocument[]>([]);
  const [allPapers, setAllPapers] = useState<PaperDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(true);
  const [expandedPaperId, setExpandedPaperId] = useState<string | null>(null);


  const fetchPapers = async (query = '*') => {
      setIsLoading(query === '*');
      setIsSearching(query !== '*');
      setError(null);
      try {
          const response = await fetch(`/api/papers/search?q=${encodeURIComponent(query)}`);
          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.message || `API request failed with status ${response.status}`);
          }
          const fetchedPapers: PaperDocument[] = await response.json();

          setAllPapers(fetchedPapers);
          setPapers(fetchedPapers);
          if (fetchedPapers.length === 0 && query !== '*') {
             console.log(`No results found for "${query}"`);
          }

      } catch (err: any) {
          console.error(`Error fetching papers for query "${query}":`, err);
          setError(`Failed to load papers: ${err.message || 'Unknown error'}.`);
          setPapers([]);
          setAllPapers([]);
      } finally {
          setIsLoading(false);
          setIsSearching(false);
      }
  };


  const availableCategories = useMemo(() => {
    const categorySet = new Set<string>();
    allPapers.forEach(paper => {
      if (paper.categories) {
        paper.categories.forEach(cat => categorySet.add(cat));
      }
    });
    return Array.from(categorySet).sort();
  }, [allPapers]);

  const filteredPapers = useMemo(() => {
    if (selectedCategories.length === 0) return papers;
    return papers.filter(paper => 
      paper.categories?.some(cat => selectedCategories.includes(cat))
    );
  }, [papers, selectedCategories]);

  useEffect(() => {
     if (process.env.NEXT_PUBLIC_TYPESENSE_HOST && process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY) {
         fetchPapers();
     } else {
         setError("Typesense configuration is missing. Check environment variables.");
         setIsLoading(false);
         console.error("Missing Typesense NEXT_PUBLIC environment variables");
     }
  }, []);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searchTerm.trim()) {
        fetchPapers();
        return;
    }
    fetchPapers(searchTerm);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const clearFilters = () => {
    setSelectedCategories([]);
  };

  const resetSearch = () => {
    setSearchTerm('');
    fetchPapers();
  };

  const togglePaperExpansion = (paperId: string) => {
    setExpandedPaperId(prev => prev === paperId ? null : paperId);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background px-4 py-2 sm:px-6">
        <div className="grid grid-cols-3 items-center gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl">■</Link>
            <div className="flex items-center gap-3 text-sm">
              <Link href="#" className="hover:text-foreground text-muted-foreground">[B] BLOG</Link>
              <Link href="#" className="hover:text-foreground text-muted-foreground">[D] DOCS</Link>
            </div>
          </div>
          
          <div className="flex items-center gap-2 justify-center">
            <Button 
              onClick={resetSearch} 
              variant="outline" 
              size="icon"
              className="flex-shrink-0"
              disabled={isSearching}
              title="Reset search"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <form onSubmit={handleSearch} className="relative w-full max-w-md">
              <Input
                type="search"
                placeholder="Search papers..."
                className="w-full rounded-lg bg-background pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={isSearching}
              />
              <Button type="submit" size="sm" className="absolute right-0 top-0 h-full rounded-l-none" disabled={isSearching}>
                {isSearching ? 'Searching...' : 'Search'}
              </Button>
            </form>
          </div>
          
          <div className="flex items-center gap-2 justify-end whitespace-nowrap">
            <Link href="/login">
              <Button variant="outline" size="sm">Login</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Register</Button>
            </Link>
          </div>
        </div>
      </header>
      
      <div className="px-4 sm:px-6 py-8">
        <h1 className="text-7xl font-bold tracking-tight">Feed<sup className="text-4xl text-muted-foreground">({filteredPapers.length})</sup></h1>
      </div>

      <main className="flex-1 flex gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full">
        <aside className="w-64 flex-shrink-0">
          <div className="sticky top-20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium">/ FILTER</h2>
              {selectedCategories.length > 0 && (
                <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground uppercase">
                  Clear Filters
                </button>
              )}
            </div>
            
            <div className="border-t border-border pt-4">
              <button
                onClick={() => setIsCategoryFilterOpen(!isCategoryFilterOpen)}
                className="flex items-center gap-2 text-sm font-medium mb-3 w-full"
              >
                {isCategoryFilterOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Category
              </button>
              
              {isCategoryFilterOpen && (
                <div className="space-y-2 pl-6">
                  {availableCategories.map(category => (
                    <label key={category} className="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground">
                      <Checkbox
                        checked={selectedCategories.includes(category)}
                        onCheckedChange={() => toggleCategory(category)}
                      />
                      <span className={selectedCategories.includes(category) ? 'text-foreground' : 'text-muted-foreground'}>
                        {category}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        <div className="flex-1">
          {isLoading && <p>Loading papers...</p>}
          {error && <p className="text-red-600">{error}</p>}
          {!isLoading && !error && (
            <div className="border-t border-border">
              <div className="grid grid-cols-[140px_1fr] border-b border-border py-3 px-4 text-sm font-medium">
                <div>/ DATE</div>
                <div>/ NAME</div>
              </div>
              {filteredPapers.length > 0 ? (
                filteredPapers.map((paper) => {
                  const isExpanded = expandedPaperId === paper.id;
                  return (
                    <div key={paper.id} className="border-b border-border">
                      <div 
                        className="grid grid-cols-[140px_1fr_auto] py-4 px-4 hover:bg-accent/30 transition-colors cursor-pointer"
                        onClick={() => togglePaperExpansion(paper.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl leading-none">■</span>
                          <span className="text-sm">{paper.year || 'N/A'}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xl font-normal truncate">{paper.title || `Paper ${paper.id}`}</div>
                          <div className={`text-sm text-muted-foreground mt-1 ${isExpanded ? '' : 'truncate'}`}>
                            {(Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors) || 'Unknown Authors'}
                          </div>
                        </div>
                        <div className="flex items-center">
                          {isExpanded && <Minus className="h-5 w-5" />}
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="px-4 pb-6 space-y-6">
                          <div className="grid grid-cols-[140px_1fr] gap-4">
                            <div>
                              <div className="text-sm font-medium">SUMMARY:</div>
                            </div>
                            <div>
                              <p className="text-base">{paper.abstract || 'No abstract available.'}</p>
                            </div>
                          </div>
                          
                          {paper.categories && paper.categories.length > 0 && (
                            <div className="grid grid-cols-[140px_1fr]">
                              <div className="text-sm font-medium">TOPICS:</div>
                              <div className="flex gap-2">
                                {paper.categories.map((category, idx) => (
                                  <span key={idx} className="border border-border px-3 py-1 text-sm uppercase">
                                    {category}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <Link href={`/paper/${paper.id}`} className="block">
                            <Button variant="outline" className="w-full rounded-full py-6 text-base">
                              Read
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                !isSearching && <p className="p-4">No papers found.</p>
              )}
            </div>
          )}
          {isSearching && !isLoading && <p>Searching...</p>}
        </div>
      </main>

      <footer className="border-t bg-background px-4 py-2 text-center text-xs text-muted-foreground sm:px-6">
        Social ArXiv Demo Project
      </footer>
    </div>
  );
}