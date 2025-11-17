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

export async function PUT(request: Request) {
  try {
    const me = await getUidFromRequest(request);
    const { pinnedPaperIds } = (await request.json()) as {
      pinnedPaperIds: string[];
    };

    if (!Array.isArray(pinnedPaperIds)) {
      return NextResponse.json(
        { message: 'pinnedPaperIds must be an array' },
        { status: 400 }
      );
    }

    if (pinnedPaperIds.length > 4) {
      return NextResponse.json(
        { message: 'Maximum 4 pinned papers allowed' },
        { status: 400 }
      );
    }

    for (const paperId of pinnedPaperIds) {
      const bookmarkRef = db.doc(`users/${me}/bookmarks/${paperId}`);
      const bookmarkSnap = await bookmarkRef.get();
      if (!bookmarkSnap.exists) {
        return NextResponse.json(
          { message: `Paper ${paperId} is not in your bookmarks` },
          { status: 400 }
        );
      }
    }

    await db.doc(`profiles/${me}`).update({
      pinnedPaperIds,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ message }, { status: 400 });
  }
}
