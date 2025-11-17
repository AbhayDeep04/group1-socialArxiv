'use client';

import { Note } from '@/lib/types/note';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Edit, MapPin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NoteItemProps {
  note: Note;
  onDelete: (noteId: string) => void;
  onEdit?: (noteId: string) => void;
  onJumpToHighlight?: (note: Note) => void;
}

export function NoteItem({ note, onDelete, onEdit, onJumpToHighlight }: NoteItemProps) {
  const isAnnotation = note.type === 'annotation';
  const timestamp = note.createdAt?.toDate?.() || new Date();

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
          {onEdit && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => onEdit(note.id)}
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
        <div className="mb-2 p-2 bg-muted rounded text-xs italic border-l-2" style={{ borderColor: note.annotation.color }}>
          "{note.annotation.quote.substring(0, 150)}{note.annotation.quote.length > 150 ? '...' : ''}"
          {note.annotation.pageRects?.[0] && (
            <span className="ml-2 text-muted-foreground">
              (Page {note.annotation.pageRects[0].pageNumber})
            </span>
          )}
        </div>
      )}

      <div className="text-sm whitespace-pre-wrap break-words">
        {note.content}
      </div>
    </Card>
  );
}
