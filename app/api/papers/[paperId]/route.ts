import { NextRequest, NextResponse } from 'next/server';
import Typesense from 'typesense';

const typesenseClient = new Typesense.Client({
    nodes: [{
        host: process.env.NEXT_PUBLIC_TYPESENSE_HOST || '',
        port: parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT || '443', 10),
        protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || 'https',
    }],
    apiKey: process.env.TYPESENSE_ADMIN_API_KEY || '',
    connectionTimeoutSeconds: 5,
});

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ paperId: string }> }
) {
    try {
        const { paperId } = await params;

        if (!paperId) {
            return NextResponse.json(
                { error: 'Paper ID is required' },
                { status: 400 }
            );
        }

        const document = await typesenseClient
            .collections('papers')
            .documents(paperId)
            .retrieve();

        return NextResponse.json(document);
    } catch (error: any) {
        console.error('Error fetching paper metadata:', error);
        
        if (error.httpStatus === 404) {
            return NextResponse.json(
                { error: 'Paper not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to fetch paper metadata' },
            { status: 500 }
        );
    }
}
