import { NextRequest, NextResponse } from 'next/server';
import { QdrantClient } from '@qdrant/js-client-rest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

const collection = 'paper_semantics';

function stripReferences(text: string): string {
  const markers = [
    /[\r\n]\s*references\s*[\r\n]/i,
    /[\r\n]\s*bibliography\s*[\r\n]/i,
    /[\r\n]\s*works\s+cited\s*[\r\n]/i,
  ];
  
  let cutIndex = -1;
  for (const regex of markers) {
    const matches = [...text.matchAll(new RegExp(regex, 'gi'))];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      if (lastMatch.index !== undefined) {
        cutIndex = Math.max(cutIndex, lastMatch.index);
      }
    }
  }
  
  if (cutIndex > -1) {
    return text.slice(0, cutIndex).trim();
  }
  return text;
}

async function fetchAllChunks(paperId: string): Promise<any[]> {
  let points: any[] = [];
  let nextOffset: any = undefined;
  
  do {
    const response: any = await qdrantClient.scroll(collection, {
      filter: {
        must: [
          { key: 'paperId', match: { value: paperId } },
          { key: 'level', match: { value: 'fulltext' } },
        ],
      },
      with_payload: true,
      limit: 100,
      offset: nextOffset,
    });
    
    points = points.concat(response.points || []);
    nextOffset = response.next_page_offset;
  } while (nextOffset);
  
  return points;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const { paperId } = await params;
    const excludeReferences = ['1', 'true', 'yes'].includes(
      (request.nextUrl.searchParams.get('excludeReferences') || '').toLowerCase()
    );

    let points = await fetchAllChunks(paperId);

    if (!points.length) {
      return NextResponse.json(
        { error: 'Text not available for this paper. Please try again later.' },
        { status: 404 }
      );
    }

    points.sort((a, b) => (a.payload?.chunkIndex ?? 0) - (b.payload?.chunkIndex ?? 0));
    
    const rawText = points
      .map((p) => p.payload?.chunkText || '')
      .join(' ')
      .trim();

    const text = excludeReferences ? stripReferences(rawText) : rawText;

    return NextResponse.json({
      text,
      chunks: points.length,
      length: text.length,
    });
  } catch (error: any) {
    console.error('Error fetching paper text:', error);
    return NextResponse.json(
      { error: 'Failed to fetch paper text', message: error.message },
      { status: 500 }
    );
  }
}
