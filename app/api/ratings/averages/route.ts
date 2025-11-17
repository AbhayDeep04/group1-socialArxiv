import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');
    
    if (!idsParam) {
      return NextResponse.json({ error: 'Missing ids parameter' }, { status: 400 });
    }

    const ids = idsParam.split(',').filter(id => id.trim());
    
    if (ids.length === 0) {
      return NextResponse.json({});
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: 'Too many IDs (max 100)' }, { status: 400 });
    }

    const db = getAdminDb();
    const results: Record<string, { averageRounded: number; count: number } | null> = {};

    const promises = ids.map(async (paperId) => {
      const aggRef = db.collection('papers').doc(paperId).collection('aggregates').doc('ratings');
      const aggSnap = await aggRef.get();
      
      if (aggSnap.exists) {
        const data = aggSnap.data();
        results[paperId] = {
          averageRounded: data?.averageRounded ?? 0,
          count: data?.count ?? 0,
        };
      } else {
        results[paperId] = null;
      }
    });

    await Promise.all(promises);

    const response = NextResponse.json(results);
    response.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    
    return response;
  } catch (error: any) {
    console.error('Error fetching rating averages:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch rating averages' },
      { status: 500 }
    );
  }
}
