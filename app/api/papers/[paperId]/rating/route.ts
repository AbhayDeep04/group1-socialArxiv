import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const { paperId } = await params;
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const auth = getAdminAuth();
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const body = await request.json();
    const { value } = body;

    if (!value || ![1, 2, 3, 4, 5].includes(value)) {
      return NextResponse.json({ error: 'Invalid rating value. Must be 1-5.' }, { status: 400 });
    }

    const db = getAdminDb();

    const result = await db.runTransaction(async (transaction) => {
      const ratingRef = db.collection('users').doc(uid).collection('ratings').doc(paperId);
      const aggRef = db.collection('papers').doc(paperId).collection('aggregates').doc('ratings');

      // READS FIRST
      const ratingSnap = await transaction.get(ratingRef);
      const hadRating = ratingSnap.exists;
      const oldValue = hadRating ? ratingSnap.data()?.value : null;

      const aggSnap = await transaction.get(aggRef);
      const aggData = aggSnap.exists ? aggSnap.data() as any : { sum: 0, count: 0 };
      const sum = aggData?.sum ?? 0;
      const count = aggData?.count ?? 0;

      // COMPUTE
      const newSum = sum + value - (oldValue ?? 0);
      const newCount = count + (hadRating ? 0 : 1);
      const averageRounded = newCount > 0 ? Math.round((newSum / newCount) * 2) / 2 : 0;

      const now = FieldValue.serverTimestamp();

      // WRITES AFTER ALL READS
      transaction.set(
        ratingRef,
        {
          value,
          updatedAt: now,
          ...(hadRating ? {} : { createdAt: now }),
        },
        { merge: true }
      );

      transaction.set(
        aggRef,
        {
          sum: newSum,
          count: newCount,
          averageRounded,
          updatedAt: now,
        },
        { merge: true }
      );

      return { averageRounded, count: newCount, userValue: value };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error submitting rating:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit rating' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const { paperId } = await params;
    const db = getAdminDb();
    
    const aggRef = db.collection('papers').doc(paperId).collection('aggregates').doc('ratings');
    const aggSnap = await aggRef.get();

    if (!aggSnap.exists) {
      return NextResponse.json({ averageRounded: null, count: 0 });
    }

    const { averageRounded, count } = aggSnap.data() || {};
    return NextResponse.json({ averageRounded, count });
  } catch (error: any) {
    console.error('Error fetching rating:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch rating' },
      { status: 500 }
    );
  }
}
