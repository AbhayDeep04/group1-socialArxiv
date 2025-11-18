'use client';

import { Note } from '@/lib/types/note';

interface AnnotationLayerProps {
  pageNumber: number;
  notes: Note[];
  onHighlightClick?: (note: Note) => void;
  activeCitation?: {
    pageNumber: number;
    bbox: { x: number; y: number; width: number; height: number };
  } | null;
}

export function AnnotationLayer({ pageNumber, notes, onHighlightClick, activeCitation }: AnnotationLayerProps) {
  const pageAnnotations = notes.filter(
    (note) =>
      note.type === 'annotation' &&
      note.annotation?.pageRects?.some((rect) => rect.pageNumber === pageNumber)
  );

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
      
      {/* Active Citation Highlight */}
      {activeCitation && activeCitation.pageNumber === pageNumber && (
        <div
          className="absolute border-2 border-yellow-500 bg-yellow-200/30 rounded-sm pointer-events-none z-50 animate-in fade-in duration-300"
          style={{
            left: `${activeCitation.bbox.x * 100}%`,
            top: `${activeCitation.bbox.y * 100}%`,
            width: `${activeCitation.bbox.width * 100}%`,
            height: `${activeCitation.bbox.height * 100}%`,
          }}
        />
      )}
    </>
  );
}
