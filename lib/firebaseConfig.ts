// Import the functions from the SDKs
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyC6XPZJRT6Au-v-xVus1F4Z4fQfxHHC4ho",
    authDomain: "social-arxiv-demo.firebaseapp.com",
    projectId: "social-arxiv-demo",
    storageBucket: "social-arxiv-demo.firebasestorage.app",
    messagingSenderId: "142288742295",
    appId: "1:142288742295:web:56cf96fdbbe03254de46d2"
  };

// Initialize Firebase
// We add a check getApps().length to prevent re-initializing the app on hot reloads
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Export the services you need
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db }; // Export db here