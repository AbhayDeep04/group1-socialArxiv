'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Note } from '@/lib/types/note';
import {
  subscribeToNotes,
  addGeneralNote,
  deleteNote,
} from '@/lib/db/notes';
import { NoteItem } from './NoteItem';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';

interface NotesTabProps {
  paperId: string;
  onJumpToHighlight?: (note: Note) => void;
}

export function NotesTab({ paperId, onJumpToHighlight }: NotesTabProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showComposer, setShowComposer] = useState(false);

  useEffect(() => {
    if (!user || !paperId) return;

    const unsubscribe = subscribeToNotes(user.uid, paperId, (loadedNotes) => {
      setNotes(loadedNotes);
    });

    return () => unsubscribe();
  }, [user, paperId]);

  const handleAddNote = async () => {
    if (!user || !newNoteContent.trim() || isAdding) return;

    setIsAdding(true);
    try {
      await addGeneralNote(user.uid, paperId, {
        content: newNoteContent.trim(),
      });
      setNewNoteContent('');
      setShowComposer(false);
    } catch (error) {
      console.error('Failed to add note:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!user) return;

    try {
      await deleteNote(user.uid, paperId, noteId);
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Notes & Highlights</h2>
            <p className="text-xs text-muted-foreground">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => setShowComposer(!showComposer)}
          >
            <Plus className="h-4 w-4" />
            New Note
          </Button>
        </div>

        {showComposer && (
          <div className="mt-3 space-y-2">
            <Textarea
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              placeholder="Write a note about this paper..."
              className="min-h-[80px] resize-none"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowComposer(false);
                  setNewNoteContent('');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddNote}
                disabled={!newNoteContent.trim() || isAdding}
              >
                {isAdding ? 'Saving...' : 'Save Note'}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {notes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-sm text-muted-foreground">
              <p className="mb-2">No notes yet</p>
              <p className="text-xs">Create a note or highlight text in the PDF</p>
            </div>
          </div>
        ) : (
          <div>
            {notes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                onDelete={handleDeleteNote}
                onJumpToHighlight={onJumpToHighlight}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
