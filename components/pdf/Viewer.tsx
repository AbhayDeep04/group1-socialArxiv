'use client';

import { pdfjs, Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Note } from '@/lib/types/note';
import { AnnotationLayer } from './AnnotationLayer';

// Only set worker on the client
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

interface Props {
  file: string;
  isDark: boolean;
  pdfWidth: number;
  zoom: number;
  numPages: number | null;
  onLoadSuccess: (info: { numPages: number }) => void;
  onLoadError: (err: any) => void;
  notes?: Note[];
  onHighlightClick?: (note: Note) => void;
  activeCitation?: {
    pageNumber: number;
    bbox: { x: number; y: number; width: number; height: number };
  } | null;
  onTextSelected?: (selection: {
    text: string;
    pageNumber: number;
    rects: Array<{ x: number; y: number; width: number; height: number }>;
  }) => void;
}

export default function PDFViewer({
  file,
  isDark,
  pdfWidth,
  zoom,
  numPages,
  onLoadSuccess,
  onLoadError,
  notes = [],
  onHighlightClick,
  activeCitation,
  onTextSelected,
}: Props) {
  const handleMouseUp = (pageNumber: number, event: React.MouseEvent<HTMLDivElement>) => {
    if (!onTextSelected) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.toString().trim() === '') {
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();
    
    const pageElement = event.currentTarget;
    const pageRect = pageElement.getBoundingClientRect();
    
    const clientRects = range.getClientRects();
    const normalizedRects = Array.from(clientRects).map((rect) => ({
      x: (rect.left - pageRect.left) / pageRect.width,
      y: (rect.top - pageRect.top) / pageRect.height,
      width: rect.width / pageRect.width,
      height: rect.height / pageRect.height,
    }));

    if (normalizedRects.length > 0) {
      onTextSelected({
        text: selectedText,
        pageNumber,
        rects: normalizedRects,
      });
    }
  };

  return (
    <Document
      file={file}
      onLoadSuccess={onLoadSuccess}
      onLoadError={onLoadError}
      loading={
        <div className="flex items-center justify-center h-full">
          <p>Loading PDF...</p>
        </div>
      }
    >
      {numPages &&
        Array.from({ length: numPages }, (_, index) => {
          const pageNumber = index + 1;
          return (
            <div
              key={`page_${pageNumber}`}
              className={`shadow-lg mb-4 relative ${isDark ? 'invert' : ''}`}
              onMouseUp={(e) => handleMouseUp(pageNumber, e)}
              data-page-number={pageNumber}
            >
              <Page
                pageNumber={pageNumber}
                renderTextLayer={true}
                renderAnnotationLayer={false}
                width={pdfWidth * zoom}
              />
              <div className="absolute inset-0 pointer-events-none">
                <AnnotationLayer
                  pageNumber={pageNumber}
                  notes={notes}
                  onHighlightClick={onHighlightClick}
                  activeCitation={activeCitation}
                />
              </div>
            </div>
          );
        })}
    </Document>
  );
}
