'use client';

import { Note } from '@/lib/types/note';

interface AnnotationLayerProps {
  pageNumber: number;
  notes: Note[];
  onHighlightClick?: (note: Note) => void;
}

export function AnnotationLayer({ pageNumber, notes, onHighlightClick }: AnnotationLayerProps) {
  const pageAnnotations = notes.filter(
    (note) =>
      note.type === 'annotation' &&
      note.annotation?.pageRects?.some((rect) => rect.pageNumber === pageNumber)
  );

  if (pageAnnotations.length === 0) {
    return null;
  }

  return (
    <>
      {pageAnnotations.map((note) => {
        const pageRects = note.annotation!.pageRects.filter((rect) => rect.pageNumber === pageNumber);
        return pageRects.map((rect, idx) => (
          <div
            key={`${note.id}-${idx}`}
            className="absolute cursor-pointer hover:opacity-75 transition-opacity rounded-sm pointer-events-auto"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
              backgroundColor: note.annotation!.color,
              opacity: 0.35,
            }}
            onClick={() => onHighlightClick?.(note)}
            title={note.content.substring(0, 100)}
          />
        ));
      })}
    </>
  );
}
