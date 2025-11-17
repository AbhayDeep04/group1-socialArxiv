import { NextRequest, NextResponse } from 'next/server';

// This endpoint triggers full-text hydration for a paper
// Called when a user opens a paper to start embedding process

export const runtime = 'nodejs';
export const maxDuration = 60; // Hydration can take 10-20 seconds

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const { paperId } = await params;
    const { pdfUrl } = await request.json();

    if (!paperId) {
      return NextResponse.json(
        { error: 'Paper ID is required' },
        { status: 400 }
      );
    }

    console.log(`Hydration POST received for ${paperId}`);

    // Run hydration synchronously (within maxDuration timeout)
    try {
      const { hydrateFullText } = await import('@/scripts/hydrate_fulltext.mjs');
      const url = pdfUrl || `https://arxiv.org/pdf/${paperId}.pdf`;
      
      console.log(`Starting hydration for ${paperId}`);
      const startTime = Date.now();
      
      const result = await hydrateFullText(paperId, url);
      const duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ Hydration complete for ${paperId} in ${duration}ms`);
        return NextResponse.json({
          success: true,
          message: result.cached ? 'Already hydrated' : 'Hydration complete',
          paperId,
          stats: result.stats,
          cached: result.cached,
        });
      } else {
        console.log(`❌ Hydration failed for ${paperId}: ${result.error}`);
        return NextResponse.json({
          success: false,
          error: result.error,
          paperId,
        }, { status: 500 });
      }
    } catch (error: any) {
      console.error(`Fatal error hydrating ${paperId}:`, error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Hydration failed',
        paperId,
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error triggering hydration:', error);
    return NextResponse.json(
      { error: 'Failed to trigger hydration' },
      { status: 500 }
    );
  }
}

// GET endpoint to check hydration status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const { paperId } = await params;
    const { checkIfAlreadyHydrated } = await import('@/scripts/hydrate_fulltext.mjs');
    
    const isHydrated = await checkIfAlreadyHydrated(paperId);
    
    return NextResponse.json({
      paperId,
      isHydrated,
    });
    
  } catch (error) {
    console.error('Error checking hydration status:', error);
    return NextResponse.json(
      { error: 'Failed to check hydration status' },
      { status: 500 }
    );
  }
}
