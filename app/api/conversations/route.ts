import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebaseAdmin';
import { Conversation } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Helper to verify Firebase auth token
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

// GET /api/conversations?paperId={paperId} - Get all conversations for a paper
export async function GET(request: NextRequest) {
  try {
    const userId = await verifyAuthToken(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const paperId = searchParams.get('paperId');
    
    if (!paperId) {
      return NextResponse.json({ error: 'Missing paperId' }, { status: 400 });
    }

    const db = getAdminDb();
    const conversationsRef = db.collection('conversations');
    
    // Query conversations for this user and paper
    const snapshot = await conversationsRef
      .where('userId', '==', userId)
      .where('paperId', '==', paperId)
      .get();

    const conversations: Conversation[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      conversations.push({
        id: doc.id,
        userId: data.userId,
        paperId: data.paperId,
        title: data.title,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      });
    });

    // Sort in memory for now (until index is created)
    conversations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return NextResponse.json({ conversations }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/conversations - Create a new conversation
export async function POST(request: NextRequest) {
  try {
    const userId = await verifyAuthToken(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { paperId, title } = await request.json();
    
    if (!paperId) {
      return NextResponse.json({ error: 'Missing paperId' }, { status: 400 });
    }

    const db = getAdminDb();
    const conversationsRef = db.collection('conversations');
    
    const now = new Date();
    const conversationData = {
      userId,
      paperId,
      title: title || 'New Conversation',
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await conversationsRef.add(conversationData);
    
    const conversation: Conversation = {
      id: docRef.id,
      ...conversationData,
    };

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating conversation:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
