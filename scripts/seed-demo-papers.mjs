import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function seedDemoPapers() {
  try {
    console.log('Initializing Firebase Admin...');
    
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
    console.log('Seeding demo papers...');

    const demoPapers = [
      {
        id: "paper1",
        source: "upload",
        ownerId: "system",
        visibility: "public",
        title: "Demo Paper: Attention Is All You Need",
        authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar"],
        abstract: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...",
        year: 2017,
        venue: "NIPS",
        tags: ["transformer", "nlp", "deep-learning"],
        status: "ready",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        url: "https://arxiv.org/pdf/1706.03762.pdf"
      },
      {
        id: "2308.04838",
        source: "arxiv",
        ownerId: "system",
        visibility: "public",
        title: "Demo Paper: Fast Feedforward Networks",
        authors: ["Author One", "Author Two"],
        abstract: "Abstract content...",
        year: 2023,
        venue: "ArXiv",
        tags: ["demo"],
        status: "ready",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        url: "https://arxiv.org/pdf/2308.04838.pdf"
      }
    ];

    for (const paper of demoPapers) {
      const docRef = db.collection('papers').doc(paper.id);
      await docRef.set(paper, { merge: true });
      console.log(`✅ Created/Updated paper: ${paper.id}`);
    }

    console.log('Seeding complete!');

  } catch (error) {
    console.error('Error seeding papers:', error);
  }
}

seedDemoPapers();
