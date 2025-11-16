import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK only if credentials are available
let db: ReturnType<typeof getFirestore> | null = null;

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
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

  db = getFirestore();
}

// POST handler for /api/auth/onSignUp
export async function POST(request: Request) {
  try {
    const { uid, email, displayName } = await request.json();

    // Validate input
    if (!uid || !email) {
      return NextResponse.json({ message: 'Missing uid or email' }, { status: 400 });
    }

    // Check if Firebase Admin is initialized
    if (!db) {
      return NextResponse.json({ message: 'Firebase Admin not configured' }, { status: 500 });
    }

    // Create the user document in Firestore
    // Reference the 'users' collection and set the document ID to the user's UID
    const userRef = db.collection('users').doc(uid);

    await userRef.set({
      email: email,
      displayName: displayName || email.split('@')[0], // Use provided or default
      role: 'user', // Default role
      createdAt: new Date().toISOString(), // Use Firestore timestamp later if needed
    });

    console.log(`Firestore document created for user: ${uid}`);
    // Return success response
    return NextResponse.json({ ok: true }, { status: 200 });

  } catch (error: any) {
    console.error('Error in onSignUp API route:', error);
    return NextResponse.json({ message: 'Internal Server Error', error: error.message }, { status: 500 });
  }
}