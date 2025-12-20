/**
 * Text Splitter Module
 * Splits text into chunks with overlap for RAG processing
 */

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 characters)
 * @param {string} text - Text to estimate
 * @returns {number} - Estimated token count
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks based on token count
 * @param {string} text - Text to split
 * @param {number} chunkSize - Target chunk size in tokens (500-800)
 * @param {number} overlap - Overlap between chunks in tokens (100)
 * @returns {string[]} - Array of text chunks
 */
export function splitTextIntoChunks(text, chunkSize = 600, overlap = 100) {
  const chunks = [];
  
  // Clean the text
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  // Convert token counts to approximate character counts
  const chunkChars = chunkSize * 4;
  const overlapChars = overlap * 4;
  
  let startIndex = 0;
  
  while (startIndex < cleanText.length) {
    let endIndex = Math.min(startIndex + chunkChars, cleanText.length);
    
    // Try to find a sentence boundary near the end
    if (endIndex < cleanText.length) {
      const searchText = cleanText.substring(endIndex - 200, endIndex + 200);
      const sentenceEnd = searchText.match(/[.!?]\s/);
      
      if (sentenceEnd) {
        endIndex = endIndex - 200 + sentenceEnd.index + 1;
      }
    }
    
    const chunk = cleanText.substring(startIndex, endIndex).trim();
    
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    // Move start index forward with overlap
    startIndex = endIndex - overlapChars;
    
    // Prevent infinite loop
    if (startIndex <= chunks.length > 0 ? chunks[chunks.length - 1].length : 0) {
      startIndex = endIndex;
    }
  }
  
  return chunks;
}

/**
 * Split text by pages into chunks
 * @param {Array<{pageNumber: number, text: string}>} pages - Array of pages
 * @param {number} chunkSize - Target chunk size in tokens
 * @param {number} overlap - Overlap between chunks in tokens
 * @returns {Array<{pageNumber: number, text: string}>} - Array of chunks with page numbers
 */
export function splitPagedTextIntoChunks(pages, chunkSize = 600, overlap = 100) {
  const allChunks = [];
  
  for (const page of pages) {
    if (!page.text || page.text.trim().length === 0) {
      continue;
    }
    
    const pageChunks = splitTextIntoChunks(page.text, chunkSize, overlap);
    
    for (const chunk of pageChunks) {
      allChunks.push({
        pageNumber: page.pageNumber,
        text: chunk
      });
    }
  }
  
  return allChunks;
}

/**
 * Create chunk objects with metadata
 * @param {Array<{pageNumber: number, text: string}>} chunks - Raw chunks
 * @returns {Array<{chunkId: string, pageNumber: number, text: string, tokenCount: number}>}
 */
export function createChunkObjects(chunks) {
  return chunks.map((chunk, index) => ({
    chunkId: `chunk_${index + 1}`,
    pageNumber: chunk.pageNumber,
    text: chunk.text,
    tokenCount: estimateTokens(chunk.text)
  }));
}
