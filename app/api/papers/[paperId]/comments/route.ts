import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebaseAdmin';
import { CreateCommentRequest } from '@/lib/types/comments';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verifyAuthToken(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  try {
    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying token:', error);
    return null;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ paperId: string }> }
) {
  try {
    const decodedToken = await verifyAuthToken(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { paperId } = await context.params;
    const { parentId, content }: CreateCommentRequest = await request.json();

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    if (content.length > 5000) {
      return NextResponse.json({ error: 'Content too long (max 5000 chars)' }, { status: 400 });
    }

    const db = getAdminDb();
    console.log('Server creating comment in paper:', paperId);
    const commentsRef = db.collection('papers').doc(paperId).collection('comments');

    let rootId: string | null = null;
    let path: string[] = [];
    let depth = 0;
    let parentDoc = null;

    if (parentId) {
      parentDoc = await commentsRef.doc(parentId).get();
      if (!parentDoc.exists) {
        return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
      }

      const parentData = parentDoc.data()!;
      rootId = parentData.rootId || parentId;
      path = [...(parentData.path || []), parentId];
      depth = (parentData.depth || 0) + 1;

      if (depth > 10) {
        return NextResponse.json({ error: 'Maximum nesting depth exceeded' }, { status: 400 });
      }
    }

    const now = FieldValue.serverTimestamp();
    const commentData = {
      paperId,
      parentId: parentId || null,
      rootId,
      path,
      depth,
      author: {
        uid: decodedToken.uid,
        displayName: decodedToken.name || 'Anonymous',
        photoURL: decodedToken.picture || null,
      },
      content: content.trim(),
      upvoteCount: 0,
      downvoteCount: 0,
      score: 0,
      replyCount: 0,
      createdAt: now,
      updatedAt: now,
      edited: false,
      deleted: false,
    };

    await db.runTransaction(async (transaction) => {
      const newCommentRef = commentsRef.doc();
      transaction.set(newCommentRef, commentData);

      if (parentId && parentDoc) {
        transaction.update(parentDoc.ref, {
          replyCount: FieldValue.increment(1),
        });
      }
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating comment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
