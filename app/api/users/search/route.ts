import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('query') || '').trim().toLowerCase();
    const limitParam = searchParams.get('limit') || '20';
    const limit = Math.min(parseInt(limitParam, 10), 50);

    if (!query) {
      return NextResponse.json({ results: [] });
    }

    const snapshot = await db
      .collection('profiles')
      .orderBy('searchName')
      .startAt(query)
      .endAt(query + '\uf8ff')
      .limit(limit)
      .get();

    const results = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        displayName: data.displayName,
        bio: data.bio,
        institution: data.institution,
        location: data.location,
        photoURL: data.photoURL,
        followerCount: data.followerCount,
        followingCount: data.followingCount,
      };
    });

    return NextResponse.json({ results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
