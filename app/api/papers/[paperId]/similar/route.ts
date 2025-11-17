import { NextRequest, NextResponse } from 'next/server';
import { QdrantClient } from '@qdrant/js-client-rest';
import { getAdminDb, getAdminAuth } from '@/lib/firebaseAdmin';
import { v5 as uuidv5 } from 'uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const qdrantCollectionName = 'paper_semantics';
const QDRANT_UUID_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';

const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function verifyAuthToken(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  try {
    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken.uid;
  } catch (error) {
    console.error('Error verifying token:', error);
    return null;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders as any });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const userId = await verifyAuthToken(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders as any }
      );
    }

    const { searchParams } = new URL(request.url);
    const limitParam = Math.min(
      parseInt(searchParams.get('limit') || '10', 10),
      20
    );
    const yearGte = searchParams.get('year_gte')
      ? parseInt(searchParams.get('year_gte')!, 10)
      : undefined;

    const { paperId } = await params;
    const pointId = uuidv5(`${paperId}-abstract`, QDRANT_UUID_NAMESPACE);

    console.log(`Fetching similar papers for ${paperId} with limit=${limitParam}, year_gte=${yearGte}`);

    // Check cache
    const db = getAdminDb();
    const cacheKey = `${paperId}::${yearGte ?? '*'}::${limitParam}`;
    const cacheRef = db.collection('similarPapers').doc(cacheKey);
    const cacheDoc = await cacheRef.get();
    const now = Date.now();

    if (cacheDoc.exists) {
      const data = cacheDoc.data()!;
      const computedAt = data.computedAt?.toMillis
        ? data.computedAt.toMillis()
        : new Date(data.computedAt).getTime();
      
      if (computedAt && now - computedAt < 24 * 60 * 60 * 1000) {
        console.log(`Cache hit for ${cacheKey}`);
        return NextResponse.json(
          {
            paperId,
            count: data.results.length,
            results: data.results,
            cached: true,
          },
          { status: 200, headers: corsHeaders as any }
        );
      }
      console.log(`Cache expired for ${cacheKey}`);
    }

    // Build filter
    const must: any[] = [{ key: 'level', match: { value: 'abstract' } }];
    if (!isNaN(yearGte as any)) {
      must.push({ key: 'year', range: { gte: yearGte } });
    }
    const filter: any = { must, must_not: [{ has_id: [pointId] }] };

    // Try recommend first
    let hits: any[] | null = null;
    try {
      console.log(`Trying Qdrant recommend for ${pointId}`);
      hits = await (qdrantClient as any).recommend(qdrantCollectionName, {
        positive: [pointId],
        limit: limitParam + 1,
        with_payload: true,
        filter,
      });
      console.log(`Recommend returned ${hits?.length || 0} results`);
    } catch (error: any) {
      console.warn(`Recommend failed: ${error.message}. Falling back to retrieve + search.`);
      
      // Fallback to retrieve + search
      try {
        const retrieved = await qdrantClient.retrieve(qdrantCollectionName, {
          ids: [pointId],
          with_vector: true,
        });
        
        if (!retrieved?.length || !retrieved[0]?.vector) {
          return NextResponse.json(
            { error: 'Paper embedding not found' },
            { status: 404, headers: corsHeaders as any }
          );
        }
        
        const vec = retrieved[0].vector;
        hits = await qdrantClient.search(qdrantCollectionName, {
          vector: vec as number[],
          limit: limitParam + 1,
          with_payload: true,
          filter,
        });
        console.log(`Search returned ${hits?.length || 0} results`);
      } catch (retrieveError: any) {
        console.error(`Retrieve/search failed: ${retrieveError.message}`);
        return NextResponse.json(
          { error: 'Failed to fetch similar papers', message: retrieveError.message },
          { status: 500, headers: corsHeaders as any }
        );
      }
    }

    // Process results
    const results = (hits || [])
      .filter(
        (h) =>
          h?.payload?.paperId &&
          h?.payload?.level === 'abstract' &&
          h?.id !== pointId
      )
      .slice(0, limitParam)
      .map((h) => ({
        paperId: h.payload.paperId,
        title: h.payload.title,
        abstract: h.payload.abstract,
        categories: h.payload.categories || [],
        year: h.payload.year,
        score: h.score,
      }));

    // Cache write (best effort)
    try {
      await cacheRef.set(
        {
          paperId,
          limit: limitParam,
          year_gte: yearGte ?? null,
          results,
          computedAt: new Date(),
        },
        { merge: true }
      );
      console.log(`Cached results for ${cacheKey}`);
    } catch (cacheError: any) {
      console.warn(`Cache write failed: ${cacheError.message}`);
    }

    return NextResponse.json(
      {
        paperId,
        count: results.length,
        results,
        cached: false,
      },
      { status: 200, headers: corsHeaders as any }
    );
  } catch (error: any) {
    console.error('Error in similar papers API route:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error?.message || 'Unknown error' },
      { status: 500, headers: corsHeaders as any }
    );
  }
}
