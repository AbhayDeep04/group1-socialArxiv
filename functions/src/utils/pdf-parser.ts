import pdfParse from "pdf-parse";

export interface PdfPage {
  pageNumber: number;
  text: string;
}

export interface PdfParseResult {
  pages: PdfPage[];
  totalPages: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
  };
}

/**
 * Extract text from PDF buffer with per-page breakdown
 */
export async function parsePdf(buffer: Buffer): Promise<PdfParseResult> {
  const data = await pdfParse(buffer);
  
  // pdf-parse doesn't give us per-page text by default
  // We'll use a simple approach: split by page breaks if available
  // Otherwise treat entire text as one page
  const totalPages = data.numpages;
  const fullText = data.text;
  
  // Try to split by common page break patterns
  const pageTexts = splitTextIntoPages(fullText, totalPages);
  
  const pages: PdfPage[] = pageTexts.map((text, index) => ({
    pageNumber: index + 1,
    text: text.trim(),
  }));

  return {
    pages,
    totalPages,
    metadata: {
      title: data.info?.Title,
      author: data.info?.Author,
      subject: data.info?.Subject,
      keywords: data.info?.Keywords,
    },
  };
}

/**
 * Attempt to split text into pages
 * This is a simple heuristic - for better results, use a more sophisticated parser
 */
function splitTextIntoPages(text: string, expectedPages: number): string[] {
  let pages: string[] = [];
  
  // Try form feed first (most reliable)
  if (text.includes('\f')) {
    pages = text.split('\f');
  } else {
    // If we can't split reliably, just divide evenly
    const charsPerPage = Math.ceil(text.length / expectedPages);
    for (let i = 0; i < expectedPages; i++) {
      const start = i * charsPerPage;
      const end = Math.min((i + 1) * charsPerPage, text.length);
      pages.push(text.substring(start, end));
    }
  }

  return pages.filter(p => p.trim().length > 0);
}
