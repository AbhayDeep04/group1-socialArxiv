import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminStorage } from '@/lib/firebaseAdmin';

// PDF proxy endpoint - fetches PDF from arXiv or Firebase Storage and returns it
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

    // Check if this is a local file (non-arXiv ID format)
    // arXiv IDs look like: 2510.01345, 1234.5678, etc.
    const isArxivId = /^\d{4}\.\d{4,5}(v\d+)?$/.test(id);

    if (isArxivId) {
      // Fetch from arXiv
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
    } else {
      // Not an arXiv ID - check Firestore for uploaded file
      let storagePath: string | undefined;
      
      try {
        const db = getAdminDb();
        const docSnap = await db.collection('papers').doc(id).get();
        if (docSnap.exists) {
          const data = docSnap.data();
          if (data?.storagePath) {
            storagePath = data.storagePath;
          }
        }
      } catch (err) {
        console.warn('Error checking Firestore for PDF:', err);
      }

      if (storagePath) {
        // Serve from Firebase Storage
        try {
          const storage = getAdminStorage();
          const file = storage.bucket().file(storagePath);
          const [exists] = await file.exists();

          if (!exists) {
            console.error(`Storage file not found: ${storagePath}`);
             return NextResponse.json(
              { error: 'PDF file not found in storage' },
              { status: 404 }
            );
          }

          // Get metadata for Content-Length etc.
          const [metadata] = await file.getMetadata();
          
          // Create headers
          const headers = new Headers();
          headers.set('Content-Type', 'application/pdf');
          headers.set('Content-Disposition', `inline; filename="${id}.pdf"`);
          headers.set('Cache-Control', 'private, max-age=3600');
          if (metadata.size) headers.set('Content-Length', metadata.size.toString());

          // Stream the file
          // @ts-ignore - Readable stream compatibility
          const stream = file.createReadStream();
          
          // Convert Node.js Readable stream to Web ReadableStream for NextResponse
          const webStream = new ReadableStream({
            start(controller) {
              stream.on('data', (chunk) => controller.enqueue(chunk));
              stream.on('end', () => controller.close());
              stream.on('error', (err) => controller.error(err));
            },
            cancel() {
              stream.destroy();
            }
          });

          return new NextResponse(webStream, {
            status: 200,
            headers,
          });
        } catch (err) {
          console.error('Error serving from Storage:', err);
          return NextResponse.json(
            { error: 'Failed to retrieve PDF from storage' },
            { status: 500 }
          );
        }
      }

      // Local file fallback (legacy/dev)
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'public', 'pdfs', `${id}.pdf`);
      
      if (!fs.existsSync(filePath)) {
        return NextResponse.json(
          { error: 'PDF not found' },
          { status: 404 }
        );
      }

      const fileBuffer = fs.readFileSync(filePath);
      
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${id}.pdf"`,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

  } catch (error) {
    console.error('Error fetching PDF:', error);
    return NextResponse.json(
      { error: 'Failed to fetch PDF' },
      { status: 500 }
    );
  }
}
