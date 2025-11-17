import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebaseAdmin';
import { getStorage } from 'firebase-admin/storage';
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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ paperId: string }> }
) {
  try {
    const decodedToken = await verifyAuthToken(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { paperId } = await context.params;
    const db = getAdminDb();

    const paperRef = db.collection('papers').doc(paperId);
    const paperDoc = await paperRef.get();

    if (!paperDoc.exists) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    }

    const paperData = paperDoc.data()!;

    if (paperData.ownerId !== decodedToken.uid) {
      return NextResponse.json({ error: 'You do not have permission to delete this paper' }, { status: 403 });
    }

    if (paperData.storagePath) {
      try {
        const bucket = getStorage().bucket();
        await bucket.file(paperData.storagePath).delete();
      } catch (error) {
        console.error('Error deleting storage file:', error);
      }
    }

    const commentsSnapshot = await db.collection('papers').doc(paperId).collection('comments').get();
    const batch = db.batch();
    let batchCount = 0;
    
    for (const doc of commentsSnapshot.docs) {
      batch.delete(doc.ref);
      batchCount++;
      
      if (batchCount >= 500) {
        await batch.commit();
        batchCount = 0;
      }
    }
    
    if (batchCount > 0) {
      await batch.commit();
    }

    const notesSnapshot = await db.collectionGroup('notes').where('paperId', '==', paperId).get();
    const notesBatch = db.batch();
    let notesBatchCount = 0;
    
    for (const doc of notesSnapshot.docs) {
      notesBatch.delete(doc.ref);
      notesBatchCount++;
      
      if (notesBatchCount >= 500) {
        await notesBatch.commit();
        notesBatchCount = 0;
      }
    }
    
    if (notesBatchCount > 0) {
      await notesBatch.commit();
    }

    await paperRef.delete();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('Error deleting paper:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
