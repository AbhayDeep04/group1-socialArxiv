'use client';

import { useState } from 'react';
import { Note } from '@/lib/types/note';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Edit, MapPin, Save, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { updateNote } from '@/lib/db/notes';
import { useAuth } from '@/lib/auth-context';

interface NoteItemProps {
  note: Note;
  paperId: string;
  onDelete: (noteId: string) => void;
  onJumpToHighlight?: (note: Note) => void;
}

export function NoteItem({ note, paperId, onDelete, onJumpToHighlight }: NoteItemProps) {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [isSaving, setIsSaving] = useState(false);

  const isAnnotation = note.type === 'annotation';
  const timestamp = note.createdAt?.toDate?.() || new Date();

  const handleSave = async () => {
    if (!user || !draft.trim() || isSaving) return;

    setIsSaving(true);
    try {
      await updateNote(user.uid, paperId, note.id, {
        content: draft.trim(),
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update note:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(note.content);
    setIsEditing(false);
  };

  return (
    <Card className="p-3 mb-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isAnnotation && (
            <div
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: note.annotation?.color || '#fff475' }}
            />
          )}
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(timestamp, { addSuffix: true })}
          </span>
        </div>
        <div className="flex gap-1">
          {isAnnotation && onJumpToHighlight && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => onJumpToHighlight(note)}
              title="Jump to highlight"
            >
              <MapPin className="h-3 w-3" />
            </Button>
          )}
          {!isEditing && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => setIsEditing(true)}
              title="Edit note"
            >
              <Edit className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-destructive"
            onClick={() => onDelete(note.id)}
            title="Delete note"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {isAnnotation && note.annotation?.quote && (
        <div
          className="mb-2 p-2 bg-muted rounded text-xs italic border-l-2"
          style={{ borderColor: note.annotation.color }}
        >
          "{note.annotation.quote.substring(0, 150)}
          {note.annotation.quote.length > 150 ? '...' : ''}"
          {note.annotation.pageRects?.[0] && (
            <span className="ml-2 text-muted-foreground">
              (Page {note.annotation.pageRects[0].pageNumber})
            </span>
          )}
        </div>
      )}

      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[100px] resize-none font-mono text-sm"
            placeholder="Write your note (supports markdown)..."
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={handleCancel}>
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!draft.trim() || isSaving}>
              <Save className="h-3 w-3 mr-1" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      ) : (
        <MarkdownRenderer content={note.content} />
      )}
    </Card>
  );
}
