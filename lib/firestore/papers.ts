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
  collectionGroup,
  documentId
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
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      tags: data.tags || [],
      authors: data.authors || [],
    } as Paper;
  });
}

async function fetchPapersByIds(paperIds: string[]): Promise<Paper[]> {
  if (paperIds.length === 0) return [];
  
  const promises = paperIds.map(async (id) => {
    try {
      const docRef = doc(db, PAPERS_COLLECTION, id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        id: snap.id,
        ...data,
        tags: data.tags || [],
        authors: data.authors || [],
      } as Paper;
    } catch (err) {
      console.warn(`Skipping paper ${id} due to error:`, err);
      return null;
    }
  });

  const results = await Promise.all(promises);
  return results.filter((p): p is Paper => p !== null);
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
