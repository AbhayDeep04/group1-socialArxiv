import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import {
  Note,
  CreateGeneralNoteData,
  CreateAnnotationNoteData,
  UpdateNoteData,
} from '@/lib/types/note';

export async function addGeneralNote(
  uid: string,
  paperId: string,
  data: CreateGeneralNoteData
): Promise<string> {
  const notesRef = collection(db, `users/${uid}/papers/${paperId}/notes`);
  const docRef = await addDoc(notesRef, {
    userId: uid,
    paperId,
    type: 'general',
    content: data.content,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function addAnnotationNote(
  uid: string,
  paperId: string,
  data: CreateAnnotationNoteData
): Promise<string> {
  const notesRef = collection(db, `users/${uid}/papers/${paperId}/notes`);
  const docRef = await addDoc(notesRef, {
    userId: uid,
    paperId,
    type: 'annotation',
    content: data.content,
    annotation: {
      quote: data.quote,
      color: data.color,
      pageRects: data.pageRects,
      anchors: data.anchors,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateNote(
  uid: string,
  paperId: string,
  noteId: string,
  data: UpdateNoteData
): Promise<void> {
  const noteRef = doc(db, `users/${uid}/papers/${paperId}/notes/${noteId}`);
  await updateDoc(noteRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteNote(
  uid: string,
  paperId: string,
  noteId: string
): Promise<void> {
  const noteRef = doc(db, `users/${uid}/papers/${paperId}/notes/${noteId}`);
  await deleteDoc(noteRef);
}

export function subscribeToNotes(
  uid: string,
  paperId: string,
  callback: (notes: Note[]) => void
): Unsubscribe {
  const notesRef = collection(db, `users/${uid}/papers/${paperId}/notes`);
  const q = query(notesRef, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const notes: Note[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Note[];
    callback(notes);
  });
}
