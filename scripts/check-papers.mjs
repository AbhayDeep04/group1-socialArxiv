import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function checkPapers() {
  try {
    console.log('Initializing Firebase Admin...');
    
    // Initialize Firebase Admin
    if (getApps().length === 0) {
      const serviceAccount = {
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'social-arxiv-demo-63c41',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      };

      if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
        console.error('Error: FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY is missing in .env.local');
        process.exit(1);
      }

      initializeApp({
        credential: cert(serviceAccount)
      });
    }

    const db = getFirestore();
    console.log('Fetching papers collection...');

    const snapshot = await db.collection('papers').get();
    
    if (snapshot.empty) {
      console.log('No papers found in the database.');
      return;
    }

    console.log(`Found ${snapshot.size} papers:\n`);
    console.log('ID | Visibility | Status | OwnerID | Title');
    console.log('-'.repeat(80));

    let publicCount = 0;
    let privateCount = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      const visibility = data.visibility || 'undefined';
      const status = data.status || 'undefined';
      const title = (data.title || 'No Title').substring(0, 30);
      
      if (visibility === 'public') publicCount++;
      else privateCount++;

      console.log(`${doc.id} | ${visibility.padEnd(9)} | ${status.padEnd(8)} | ${data.ownerId || 'null'} | ${title}`);
    });

    console.log('-'.repeat(80));
    console.log(`\nSummary: ${publicCount} public, ${privateCount} private/unlisted.`);

  } catch (error) {
    console.error('Error checking papers:', error);
  }
}

checkPapers();
