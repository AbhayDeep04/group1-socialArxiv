import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    conversationId: string;
  }>;
}

// DELETE /api/conversations/[conversationId] - Delete a conversation and its messages
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { conversationId } = await params;

    const db = getAdminDb();
    
    // Delete all messages in the conversation
    const messagesRef = db.collection('conversations').doc(conversationId).collection('messages');
    const messagesSnapshot = await messagesRef.get();
    
    const batch = db.batch();
    messagesSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    // Delete the conversation document
    batch.delete(db.collection('conversations').doc(conversationId));
    
    await batch.commit();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('Error deleting conversation:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/conversations/[conversationId] - Update conversation title
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { conversationId } = await params;
    const { title } = await request.json();

    if (!title) {
      return NextResponse.json({ error: 'Missing title' }, { status: 400 });
    }

    const db = getAdminDb();
    const conversationRef = db.collection('conversations').doc(conversationId);
    
    await conversationRef.update({
      title,
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('Error updating conversation:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
