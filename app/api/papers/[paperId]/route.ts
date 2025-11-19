import { NextRequest, NextResponse } from 'next/server';
import Typesense from 'typesense';
import { getAdminDb } from '@/lib/firebaseAdmin';

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

        // 1. Try fetching from Typesense (fastest, best for search-indexed papers)
        try {
            const document = await typesenseClient
                .collections('papers')
                .documents(paperId)
                .retrieve();
            
            return NextResponse.json(document);
        } catch (typesenseError: any) {
            // If not found in Typesense, it might be a new upload or not indexed yet
            if (typesenseError.httpStatus === 404) {
                // 2. Fallback to Firestore (authoritative source)
                try {
                    const db = getAdminDb();
                    const docRef = db.collection('papers').doc(paperId);
                    const docSnap = await docRef.get();

                    if (docSnap.exists) {
                        const data = docSnap.data();
                        return NextResponse.json({
                            id: docSnap.id,
                            ...data,
                            // Ensure fields match what frontend/Typesense schema expects
                            // Typesense papers usually have 'id' and other fields at root
                        });
                    }
                } catch (firestoreError) {
                    console.error('Error fetching from Firestore:', firestoreError);
                }
            }
            
            // If we're here, it's a genuine 404 or error
            if (typesenseError.httpStatus === 404) {
                return NextResponse.json(
                    { error: 'Paper not found' },
                    { status: 404 }
                );
            }
            throw typesenseError;
        }
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
