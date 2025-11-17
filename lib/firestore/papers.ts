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
  serverTimestamp,
  collectionGroup
} from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { Paper, CreatePaperData } from "@/lib/types/paper";
import { getBookmarkedPaperIds } from "./bookmarks";

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

async function fetchPapersByIds(paperIds: string[]): Promise<Paper[]> {
  if (paperIds.length === 0) return [];
  
  const papers: Paper[] = [];
  const chunkSize = 10;
  
  for (let i = 0; i < paperIds.length; i += chunkSize) {
    const chunk = paperIds.slice(i, i + chunkSize);
    const q = query(
      collection(db, PAPERS_COLLECTION),
      where("__name__", "in", chunk)
    );
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(doc => {
      papers.push({
        id: doc.id,
        ...doc.data(),
      } as Paper);
    });
  }
  
  return papers;
}

export async function getPapersWithUserNotes(userId: string, limitCount = 50): Promise<Paper[]> {
  const q = query(
    collectionGroup(db, "notes"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  
  const latestByPaper: Record<string, number> = {};
  const paperIds = new Set<string>();
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const paperId = data.paperId;
    const createdAt = data.createdAt?.toMillis() || 0;
    
    if (!latestByPaper[paperId] || createdAt > latestByPaper[paperId]) {
      latestByPaper[paperId] = createdAt;
    }
    paperIds.add(paperId);
  });
  
  const papers = await fetchPapersByIds(Array.from(paperIds));
  
  return papers.sort((a, b) => {
    const aTime = latestByPaper[a.id] || 0;
    const bTime = latestByPaper[b.id] || 0;
    return bTime - aTime;
  });
}

export async function getPapersUserCommented(userId: string, limitCount = 50): Promise<Paper[]> {
  const q = query(
    collectionGroup(db, "comments"),
    where("author.uid", "==", userId),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  
  const latestByPaper: Record<string, number> = {};
  const paperIds = new Set<string>();
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const paperId = data.paperId;
    const createdAt = data.createdAt?.toMillis() || 0;
    
    if (!latestByPaper[paperId] || createdAt > latestByPaper[paperId]) {
      latestByPaper[paperId] = createdAt;
    }
    paperIds.add(paperId);
  });
  
  const papers = await fetchPapersByIds(Array.from(paperIds));
  
  return papers.sort((a, b) => {
    const aTime = latestByPaper[a.id] || 0;
    const bTime = latestByPaper[b.id] || 0;
    return bTime - aTime;
  });
}
export async function getBookmarkedPapers(userId: string, limitCount = 50): Promise<Paper[]> {
  const paperIds = await getBookmarkedPaperIds(userId, limitCount);
  const papers = await fetchPapersByIds(paperIds);
  
  return papers;
}
