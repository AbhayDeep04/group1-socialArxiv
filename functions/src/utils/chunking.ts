export interface TextChunk {
  text: string;
  chunkIndex: number;
  page: number;
  charCount: number;
}

export interface ChunkingOptions {
  chunkSize?: number;
  overlap?: number;
}

/**
 * Chunks text into overlapping segments
 */
export function chunkText(
  text: string,
  page: number,
  options: ChunkingOptions = {}
): TextChunk[] {
  const { chunkSize = 1400, overlap = 200 } = options;
  
  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    const chunkText = text.slice(startIndex, endIndex);
    
    chunks.push({
      text: chunkText.trim(),
      chunkIndex,
      page,
      charCount: chunkText.length,
    });

    chunkIndex++;
    startIndex += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Chunks text from multiple pages
 */
export function chunkPages(
  pages: { pageNumber: number; text: string }[],
  options: ChunkingOptions = {}
): TextChunk[] {
  const allChunks: TextChunk[] = [];
  let globalChunkIndex = 0;

  for (const page of pages) {
    const pageChunks = chunkText(page.text, page.pageNumber, options);
    
    // Update global chunk indices
    for (const chunk of pageChunks) {
      allChunks.push({
        ...chunk,
        chunkIndex: globalChunkIndex++,
      });
    }
  }

  return allChunks;
}
