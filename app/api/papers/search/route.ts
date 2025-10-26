import { NextRequest, NextResponse } from 'next/server';
import Typesense from 'typesense';

// Initialize Typesense Client (Server-Side)
// Use Admin key on the server for potentially broader search capabilities if needed
// Ensure environment variables are set in .env.local
const typesenseClient = new Typesense.Client({
    nodes: [{
        host: process.env.NEXT_PUBLIC_TYPESENSE_HOST || '',
        port: parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT || '443', 10),
        protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || 'https',
    }],
    apiKey: process.env.TYPESENSE_ADMIN_API_KEY || '', // Use Admin key on server
    connectionTimeoutSeconds: 10,
});

const collectionName = 'papers'; // Collection name we used in ingest script

// GET handler for /api/papers/search?q=...
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q'); // Get the search query 'q' from URL parameters
    // Future: Get other filters like category, year from searchParams

    if (!query) {
      return NextResponse.json({ message: 'Search query parameter "q" is required' }, { status: 400 });
    }

    // Define Typesense search parameters
    const searchParameters = {
      'q': query,
      'query_by': 'title,abstract,authors', // Fields to search within
      'per_page': 20, // Number of results to return
      // Add filters later: 'filter_by': `year:=${yearValue} && categories:${categoryValue}`
      // Add sorting later: 'sort_by': 'year:desc'
    };

    console.log('Performing Typesense search with params:', searchParameters);

    // Perform the search
    const searchResults = await typesenseClient.collections(collectionName)
                                 .documents()
                                 .search(searchParameters);

    // Extract only the document data from the hits
    const papers = searchResults.hits?.map(hit => hit.document) || [];

    // Return the search results
    return NextResponse.json(papers, { status: 200 });

  } catch (error: any) {
    console.error('Error in Typesense search API route:', error);
    return NextResponse.json({ message: 'Search failed', error: error.message }, { status: 500 });
  }
}