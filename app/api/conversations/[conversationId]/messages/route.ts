import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { Message } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    conversationId: string;
  }>;
}

// GET /api/conversations/[conversationId]/messages - Get all messages in a conversation
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { conversationId } = await params;

    const db = getAdminDb();
    const messagesRef = db.collection('conversations').doc(conversationId).collection('messages');
    const snapshot = await messagesRef.orderBy('createdAt', 'asc').get();

    const messages: Message[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        role: data.role,
        content: data.content,
        sources: data.sources || [],
        createdAt: data.createdAt.toDate(),
      });
    });

    return NextResponse.json({ messages }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
