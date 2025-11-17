import { NextRequest, NextResponse } from 'next/server';

interface ReferenceItem {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue?: string | null;
  doi?: string | null;
  arxivId?: string | null;
  urls?: {
    landing?: string;
    pdf?: string;
  };
  source: 'semanticscholar' | 'openalex';
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ paperId: string }> }
) {
  try {
    const { paperId } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    console.log('[References] Request received:', { paperId, offset, limit });

    const arxivId = paperId.replace(/^arxiv[-:]?/i, '');
    console.log('[References] Normalized arXiv ID:', arxivId);

    const fields = [
      'paperId',
      'title',
      'year',
      'venue',
      'authors',
      'externalIds',
      'url',
      'openAccessPdf',
    ].join(',');

    const s2Url = `https://api.semanticscholar.org/graph/v1/paper/ARXIV:${arxivId}/references?fields=${fields}&limit=${limit}&offset=${offset}`;
    console.log('[References] Fetching from Semantic Scholar:', s2Url);

    const s2Response = await fetch(s2Url, {
      headers: {
        ...(process.env.SEMANTIC_SCHOLAR_API_KEY && {
          'x-api-key': process.env.SEMANTIC_SCHOLAR_API_KEY,
        }),
      },
      next: { revalidate: 86400 },
    });

    console.log('[References] Semantic Scholar response status:', s2Response.status);

    if (s2Response.ok) {
      const json = await s2Response.json();
      const items: ReferenceItem[] = (json.data || []).map((r: any) => {
        const p = r.citedPaper;
        const doi = p.externalIds?.DOI ?? null;
        const arx = p.externalIds?.ArXiv ?? p.externalIds?.ArXivId ?? null;
        
        return {
          id: doi ?? arx ?? p.paperId ?? p.url,
          title: p.title,
          authors: (p.authors || []).map((a: any) => a.name || a),
          year: p.year ?? null,
          venue: p.venue ?? null,
          doi,
          arxivId: arx,
          urls: {
            landing: doi 
              ? `https://doi.org/${doi}` 
              : arx 
              ? `https://arxiv.org/abs/${arx}` 
              : p.url ?? undefined,
            pdf: p.openAccessPdf?.url,
          },
          source: 'semanticscholar' as const,
        };
      });

      const nextOffset = json.next ?? null;

      console.log('[References] Successfully fetched from Semantic Scholar:', {
        itemsCount: items.length,
        nextOffset,
      });

      return NextResponse.json({
        items,
        total: null,
        nextOffset,
        sourceUsed: 'semanticscholar',
      });
    }

    console.log('[References] Semantic Scholar failed, trying OpenAlex fallback');

    if (s2Response.status === 404 || s2Response.status === 400) {
      const errorText = await s2Response.text();
      console.log('[References] Semantic Scholar error response:', errorText);
      const oaWorkResponse = await fetch(
        `https://api.openalex.org/works?filter=ids.arxiv:https://arxiv.org/abs/${arxivId}&select=id,referenced_works`,
        {
          headers: {
            'User-Agent': 'SocialArxiv (mailto:contact@socialarxiv.com)',
          },
          next: { revalidate: 86400 },
        }
      );

      if (!oaWorkResponse.ok) {
        return NextResponse.json(
          { error: 'Failed to fetch references from fallback source' },
          { status: 500 }
        );
      }

      const oaWork = await oaWorkResponse.json();
      const ids: string[] = oaWork?.results?.[0]?.referenced_works ?? [];
      
      if (ids.length === 0) {
        return NextResponse.json({
          items: [],
          total: 0,
          nextOffset: null,
          sourceUsed: 'openalex',
        });
      }

      const batch = ids.slice(offset, offset + limit);
      
      if (batch.length === 0) {
        return NextResponse.json({
          items: [],
          total: ids.length,
          nextOffset: null,
          sourceUsed: 'openalex',
        });
      }

      const oaDetailsResponse = await fetch(
        `https://api.openalex.org/works?ids=${batch.join('|')}&select=id,display_name,publication_year,authorships,host_venue,ids,doi,primary_location`,
        {
          headers: {
            'User-Agent': 'SocialArxiv (mailto:contact@socialarxiv.com)',
          },
          next: { revalidate: 86400 },
        }
      );

      if (!oaDetailsResponse.ok) {
        return NextResponse.json(
          { error: 'Failed to fetch reference details' },
          { status: 500 }
        );
      }

      const oaDetails = await oaDetailsResponse.json();
      const items: ReferenceItem[] = (oaDetails.results || []).map((p: any) => {
        const doi = p.doi ?? p.ids?.doi ?? null;
        const arx = p.ids?.arxiv ? p.ids.arxiv.split('/').pop() : null;
        const pdf = p.primary_location?.pdf_url ?? p.primary_location?.source?.hosted ?? undefined;

        return {
          id: doi ?? arx ?? p.id,
          title: p.display_name,
          authors: (p.authorships || []).flatMap((a: any) =>
            a.author?.display_name ? [a.author.display_name] : []
          ),
          year: p.publication_year ?? null,
          venue: p.host_venue?.display_name ?? null,
          doi,
          arxivId: arx,
          urls: {
            landing: doi 
              ? `https://doi.org/${doi}` 
              : arx 
              ? `https://arxiv.org/abs/${arx}` 
              : p.id,
            pdf,
          },
          source: 'openalex' as const,
        };
      });

      const nextOffset = offset + batch.length < ids.length ? offset + batch.length : null;

      console.log('[References] Successfully fetched from OpenAlex:', {
        totalIds: ids.length,
        itemsCount: items.length,
        nextOffset,
      });

      return NextResponse.json({
        items,
        total: ids.length,
        nextOffset,
        sourceUsed: 'openalex',
      });
    }

    const errorText = await s2Response.text();
    console.log('[References] All sources failed. Final S2 error:', errorText);

    return NextResponse.json(
      { error: `Failed to fetch references: ${s2Response.status}` },
      { status: s2Response.status }
    );
  } catch (error: any) {
    console.error('[References] Exception caught:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch references' },
      { status: 500 }
    );
  }
}
