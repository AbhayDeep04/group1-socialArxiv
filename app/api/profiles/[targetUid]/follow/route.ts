import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
};

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

async function getUidFromRequest(request: Request): Promise<string> {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new Error('Missing authorization token');
  const decoded = await getAuth().verifyIdToken(token);
  return decoded.uid;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ targetUid: string }> }
) {
  try {
    const me = await getUidFromRequest(request);
    const { targetUid } = await context.params;
    
    if (me === targetUid) {
      return NextResponse.json(
        { message: 'Cannot follow yourself' },
        { status: 400 }
      );
    }

    await db.runTransaction(async (tx) => {
      const followingRef = db.doc(`profiles/${me}/following/${targetUid}`);
      const followerRef = db.doc(`profiles/${targetUid}/followers/${me}`);
      const meRef = db.doc(`profiles/${me}`);
      const targetRef = db.doc(`profiles/${targetUid}`);

      const followingSnap = await tx.get(followingRef);
      if (followingSnap.exists) {
        return;
      }

      tx.set(followingRef, { createdAt: FieldValue.serverTimestamp() });
      tx.set(followerRef, { createdAt: FieldValue.serverTimestamp() });
      tx.update(meRef, {
        followingCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(targetRef, {
        followerCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ targetUid: string }> }
) {
  try {
    const me = await getUidFromRequest(request);
    const { targetUid } = await context.params;
    
    if (me === targetUid) {
      return NextResponse.json(
        { message: 'Cannot unfollow yourself' },
        { status: 400 }
      );
    }

    await db.runTransaction(async (tx) => {
      const followingRef = db.doc(`profiles/${me}/following/${targetUid}`);
      const followerRef = db.doc(`profiles/${targetUid}/followers/${me}`);
      const meRef = db.doc(`profiles/${me}`);
      const targetRef = db.doc(`profiles/${targetUid}`);

      const followingSnap = await tx.get(followingRef);
      if (!followingSnap.exists) {
        return;
      }

      tx.delete(followingRef);
      tx.delete(followerRef);
      tx.update(meRef, {
        followingCount: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(targetRef, {
        followerCount: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ message }, { status: 400 });
  }
}
