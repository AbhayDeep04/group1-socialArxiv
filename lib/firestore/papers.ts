import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  getDocs,
  Timestamp,
  serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { Paper, CreatePaperData } from "@/lib/types/paper";

const PAPERS_COLLECTION = "papers";

export async function createPaper(data: CreatePaperData): Promise<string> {
  const paperData = {
    ...data,
    visibility: data.visibility || "private",
    year: data.year || null,
    venue: data.venue || null,
    tags: data.tags || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, PAPERS_COLLECTION), paperData);
  return docRef.id;
}

export async function updatePaper(paperId: string, data: Partial<Paper>): Promise<void> {
  const docRef = doc(db, PAPERS_COLLECTION, paperId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function getPaper(paperId: string): Promise<Paper | null> {
  const docRef = doc(db, PAPERS_COLLECTION, paperId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return null;
  }
  
  return {
    id: docSnap.id,
    ...docSnap.data(),
  } as Paper;
}

export async function getUserPapers(userId: string, limitCount = 50): Promise<Paper[]> {
  const q = query(
    collection(db, PAPERS_COLLECTION),
    where("ownerId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as Paper));
}
