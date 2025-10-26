'use client'; // Needed for useState, useEffect, event handlers

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Typesense from 'typesense'; // Keep for initial load if preferred, or remove if search handles all
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
// Remove Firestore imports if still present
// import { db } from '@/lib/firebaseConfig';
// import { collection, getDocs, query, limit } from "firebase/firestore";

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
  const [papers, setPapers] = useState<PaperDocument[]>([]); // State to hold papers
  const [isLoading, setIsLoading] = useState(true); // Loading state
  const [error, setError] = useState<string | null>(null); // Error state
  const [isSearching, setIsSearching] = useState(false); // State for search loading


  // --- Function to Fetch Papers (Used for Initial Load and Search) ---
  const fetchPapers = async (query = '*') => { // Default to '*' for initial load
      setIsLoading(query === '*'); // Only show initial loading spinner
      setIsSearching(query !== '*'); // Show searching indicator
      setError(null);
      try {
          // *** Use the API route ***
          const response = await fetch(`/api/papers/search?q=${encodeURIComponent(query)}`); //
          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.message || `API request failed with status ${response.status}`);
          }
          const fetchedPapers: PaperDocument[] = await response.json(); //

          setPapers(fetchedPapers);
          if (fetchedPapers.length === 0 && query !== '*') {
             console.log(`No results found for "${query}"`);
             // Optionally set a "no results" state/message here
          }

      } catch (err: any) {
          console.error(`Error fetching papers for query "${query}":`, err);
          setError(`Failed to load papers: ${err.message || 'Unknown error'}.`);
          setPapers([]); // Clear papers on error
      } finally {
          setIsLoading(false);
          setIsSearching(false);
      }
  };


  // --- Fetch Initial Papers on Mount ---
  useEffect(() => {
    // Ensure env vars are present before initial fetch
     if (process.env.NEXT_PUBLIC_TYPESENSE_HOST && process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY) {
         fetchPapers(); // Fetch initial papers ('*')
     } else {
         setError("Typesense configuration is missing. Check environment variables.");
         setIsLoading(false);
         console.error("Missing Typesense NEXT_PUBLIC environment variables");
     }
  }, []); // Empty dependency array means this runs once on mount


  // --- Handle Search Form Submission ---
  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searchTerm.trim()) {
        fetchPapers(); // If search is cleared, fetch initial papers again
        return;
    }
    fetchPapers(searchTerm); // Fetch papers based on the search term
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background px-4 py-2 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Social arXiv Demo</h1>
          <form onSubmit={handleSearch} className="relative ml-auto flex-1 sm:flex-initial max-w-md">
            <Input
              type="search"
              placeholder="Search papers..."
              className="w-full rounded-lg bg-background pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isSearching} // Disable input while searching
            />
            <Button type="submit" size="sm" className="absolute right-0 top-0 h-full rounded-l-none" disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'} {/* Show loading state */}
            </Button>
          </form>
          {/* Add login/logout/profile button later */}
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        {/* --- Paper Grid --- */}
        {isLoading && <p>Loading papers...</p>}
        {error && <p className="text-red-600">{error}</p>}
        {/* Show papers only when not initial loading */}
        {!isLoading && !error && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {papers.length > 0 ? (
              papers.map((paper) => (
                <Link href={`/paper/${paper.id}`} key={paper.id}>
                  <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                    <CardHeader>
                      <CardTitle className="text-lg line-clamp-2">{paper.title || `Paper ${paper.id}`}</CardTitle>
                      <CardDescription className="text-xs"> {/* Opening Tag */}
                         {(Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors) || 'Unknown Authors'} - {paper.year || 'N/A'}
                      </CardDescription> {/* *** CORRECTED CLOSING TAG *** */}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {paper.abstract || 'No abstract available.'}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))
            ) : (
               // Show 'No papers found' only if not loading/searching and there are no errors
               !isSearching && <p>No papers found.</p>
            )}
          </div>
        )}
        {/* Show searching indicator separate from initial load */}
         {isSearching && !isLoading && <p>Searching...</p>}
      </main>

      <footer className="border-t bg-background px-4 py-2 text-center text-xs text-muted-foreground sm:px-6">
        Social ArXiv Demo Project
      </footer>
    </div>
  );
}