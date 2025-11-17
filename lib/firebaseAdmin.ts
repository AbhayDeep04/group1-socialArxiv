// Firebase Admin SDK for server-side operations
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth as adminGetAuth, Auth } from 'firebase-admin/auth';

let adminApp: App | undefined;
let adminDb: Firestore | undefined;
let adminAuth: Auth | undefined;

// Initialize Firebase Admin
export function initAdmin() {
  if (!getApps().length) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'social-arxiv-demo-63c41';
    
    adminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      } as any),
      projectId,
    });
  } else {
    adminApp = getApps()[0]!;
  }
  
  adminDb = adminDb || getFirestore(adminApp!);
  adminAuth = adminAuth || adminGetAuth(adminApp!);
  
  return { adminApp: adminApp!, adminDb: adminDb!, adminAuth: adminAuth! };
}

export function getAdminDb(): Firestore {
  if (!adminDb) {
    return initAdmin().adminDb;
  }
  return adminDb;
}

export function getAdminAuth(): Auth {
  if (!adminAuth) {
    return initAdmin().adminAuth;
  }
  return adminAuth;
}
