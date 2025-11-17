'use client';

import { pdfjs, Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

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
}

export default function PDFViewer({
  file,
  isDark,
  pdfWidth,
  zoom,
  numPages,
  onLoadSuccess,
  onLoadError,
}: Props) {
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
        Array.from({ length: numPages }, (_, index) => (
          <div key={`page_${index + 1}`} className={`shadow-lg mb-4 ${isDark ? 'invert' : ''}`}>
            <Page
              pageNumber={index + 1}
              renderTextLayer={true}
              renderAnnotationLayer={false}
              width={pdfWidth * zoom}
            />
          </div>
        ))}
    </Document>
  );
}
