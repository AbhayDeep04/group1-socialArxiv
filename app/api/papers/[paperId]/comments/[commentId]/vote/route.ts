import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebaseAdmin';
import { VoteRequest, VoteResponse } from '@/lib/types/comments';
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
  context: { params: Promise<{ paperId: string; commentId: string }> }
) {
  try {
    const decodedToken = await verifyAuthToken(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { paperId, commentId } = await context.params;
    const { value }: VoteRequest = await request.json();

    if (value !== 1 && value !== -1 && value !== 0) {
      return NextResponse.json({ error: 'Invalid vote value' }, { status: 400 });
    }

    const db = getAdminDb();
    const commentRef = db.collection('papers').doc(paperId).collection('comments').doc(commentId);
    const voteRef = commentRef.collection('votes').doc(decodedToken.uid);

    const result = await db.runTransaction(async (transaction) => {
      const commentDoc = await transaction.get(commentRef);
      if (!commentDoc.exists) {
        throw new Error('Comment not found');
      }

      const existingVoteDoc = await transaction.get(voteRef);
      const existingVote = existingVoteDoc.exists ? existingVoteDoc.data()!.value : 0;

      let upvoteDelta = 0;
      let downvoteDelta = 0;

      if (existingVote === 1) {
        upvoteDelta = -1;
      } else if (existingVote === -1) {
        downvoteDelta = -1;
      }

      if (value === 1) {
        upvoteDelta += 1;
      } else if (value === -1) {
        downvoteDelta += 1;
      }

      const scoreDelta = upvoteDelta - downvoteDelta;

      if (value === 0) {
        transaction.delete(voteRef);
      } else {
        transaction.set(voteRef, {
          uid: decodedToken.uid,
          value,
          createdAt: existingVoteDoc.exists ? existingVoteDoc.data()!.createdAt : FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      transaction.update(commentRef, {
        upvoteCount: FieldValue.increment(upvoteDelta),
        downvoteCount: FieldValue.increment(downvoteDelta),
        score: FieldValue.increment(scoreDelta),
      });

      const commentData = commentDoc.data()!;
      return {
        upvoteCount: (commentData.upvoteCount || 0) + upvoteDelta,
        downvoteCount: (commentData.downvoteCount || 0) + downvoteDelta,
        score: (commentData.score || 0) + scoreDelta,
        userVote: value === 0 ? null : value,
      } as VoteResponse;
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Error voting on comment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
