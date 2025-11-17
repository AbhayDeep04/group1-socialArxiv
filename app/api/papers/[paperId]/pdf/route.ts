import { NextRequest, NextResponse } from 'next/server';

// PDF proxy endpoint - fetches PDF from arXiv and returns it
// This allows the frontend to display PDFs without CORS issues

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const { paperId: idRaw } = await params;
    if (!idRaw) {
      return NextResponse.json(
        { error: 'Paper ID is required' },
        { status: 400 }
      );
    }

    // Remove trailing .pdf if present
    const id = idRaw.replace(/\.pdf$/i, '');

    // Construct arXiv PDF URL
    const arxivPdfUrl = `https://arxiv.org/pdf/${encodeURIComponent(id)}.pdf`;

    // Forward Range header if present (for partial PDF loading)
    const outgoingHeaders: Record<string, string> = {
      'User-Agent': 'SocialArxivPDFProxy/1.0 (Educational Project)',
      'Accept': 'application/pdf,*/*;q=0.8',
    };
    const range = request.headers.get('range');
    if (range) outgoingHeaders['Range'] = range;

    // Fetch PDF from arXiv with proper headers
    const upstream = await fetch(arxivPdfUrl, {
      headers: outgoingHeaders,
      redirect: 'follow',
      cache: 'no-store',
    });

    // Allow 200 OK and 206 Partial Content
    if (!(upstream.ok || upstream.status === 206)) {
      const text = await upstream.text().catch(() => '');
      console.error('arXiv PDF fetch failed', upstream.status, text.slice(0, 200));
      return NextResponse.json(
        { error: 'Failed to fetch PDF from arXiv' },
        { status: upstream.status }
      );
    }

    // Build response headers
    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${id}.pdf"`);
    headers.set('Cache-Control', 'public, max-age=86400');

    // Pass through important headers for proper PDF streaming
    for (const h of ['accept-ranges', 'content-range', 'content-length', 'etag', 'last-modified']) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }

    // Stream the response instead of buffering
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });

  } catch (error) {
    console.error('Error fetching PDF:', error);
    return NextResponse.json(
      { error: 'Failed to fetch PDF' },
      { status: 500 }
    );
  }
}
