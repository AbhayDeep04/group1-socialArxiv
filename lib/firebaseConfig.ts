// Import the functions from the SDKs
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCYzfRqIvF3dQjMn1Xsx6MZ3L3qowy39yY",
  authDomain: "social-arxiv-demo-63c41.firebaseapp.com",
  projectId: "social-arxiv-demo-63c41",
  storageBucket: "social-arxiv-demo-63c41.firebasestorage.app",
  messagingSenderId: "147506110098",
  appId: "1:147506110098:web:276a32b46913d595e1504b"
};

// Initialize Firebase
// We add a check getApps().length to prevent re-initializing the app on hot reloads
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Export the services you need
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db }; // Export db here