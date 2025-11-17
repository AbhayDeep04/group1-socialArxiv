import { NextRequest, NextResponse } from 'next/server';

// This endpoint triggers background hydration for a paper's full text
// Called when a user opens a paper to start embedding process in background

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

    // Trigger hydration in background (don't await)
    // This allows the API to return immediately while processing continues
    hydrateInBackground(paperId, pdfUrl).catch(error => {
      console.error(`Background hydration failed for ${paperId}:`, error);
    });

    return NextResponse.json({
      success: true,
      message: 'Full-text hydration started in background',
      paperId,
    });

  } catch (error) {
    console.error('Error triggering hydration:', error);
    return NextResponse.json(
      { error: 'Failed to trigger hydration' },
      { status: 500 }
    );
  }
}

async function hydrateInBackground(paperId: string, pdfUrl?: string) {
  // Dynamic import to avoid loading heavy dependencies at startup
  const { hydrateFullText } = await import('@/scripts/hydrate_fulltext.mjs');
  
  const url = pdfUrl || `https://arxiv.org/pdf/${paperId}.pdf`;
  
  console.log(`[Background] Starting hydration for ${paperId}`);
  const startTime = Date.now();
  
  try {
    const result = await hydrateFullText(paperId, url);
    const duration = Date.now() - startTime;
    
    if (result.success) {
      console.log(`[Background] ✅ Hydration complete for ${paperId} in ${duration}ms`);
    } else {
      console.log(`[Background] ❌ Hydration failed for ${paperId}: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    console.error(`[Background] Fatal error hydrating ${paperId}:`, error);
    throw error;
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
