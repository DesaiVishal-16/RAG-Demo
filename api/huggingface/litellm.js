import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import fs from 'fs';

let openaiClient = null;
let currentModel = null;
let currentApiKey = null;
let documentChunks = [];
let documentInfo = null;

/**
 * Initialize the LiteLLM client with Hugging Face
 * @param {string} apiKey - Hugging Face API key
 * @param {string} model - Model name (default: moonshotai/Kimi-K2-Thinking-hugging)
 */
export function initializeAssistants(apiKey, model = 'moonshotai/Kimi-K2-Thinking-hugging') {
  if (!apiKey) {
    throw new Error('Hugging Face API key is required');
  }

  currentApiKey = apiKey;
  currentModel = model;

  openaiClient = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.huggingface.co/v1',
  });

  console.log('[LiteLLM] Hugging Face client initialized');
  console.log('[LiteLLM] Using model:', model);
}

/**
 * Setup document with the uploaded PDF
 * Parses PDF and creates chunks for RAG
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<{filename: string, numChunks: number}>}
 */
export async function setupAssistant(filePath) {
  if (!openaiClient) {
    throw new Error('LiteLLM not initialized. Call initializeAssistants() first.');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  try {
    console.log('[LiteLLM] Reading PDF file...');
    const fileData = await fs.readFile(filePath);
    
    console.log('[LiteLLM] Parsing PDF...');
    const pdfData = await pdfParse(fileData);
    
    console.log(`[LiteLLM] PDF parsed - ${pdfData.numpages} pages, ${pdfData.text.length} characters`);
    
    const chunks = createChunks(pdfData.text, 1000, 200);
    documentChunks = chunks;
    
    console.log(`[LiteLLM] Created ${chunks.length} chunks for RAG`);
    
    documentInfo = {
      filename: filePath.split('/').pop(),
      numPages: pdfData.numpages,
      numChunks: chunks.length,
      textLength: pdfData.text.length
    };

    await fs.unlink(filePath);
    console.log('[LiteLLM] Setup complete');

    return {
      assistantId: 'lite-rag-assistant',
      vectorStoreId: 'lite-vector-store',
      threadId: 'lite-thread',
      fileId: 'lite-file',
      ...documentInfo
    };
  } catch (error) {
    console.error('[LiteLLM] Setup failed:', error.message);
    throw error;
  }
}

/**
 * Create text chunks from document text
 * @param {string} text - Full document text
 * @param {number} chunkSize - Target chunk size in characters
 * @param {number} overlap - Overlap between chunks
 * @returns {Array<{id: string, text: string, page?: number}>}
 */
function createChunks(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  let id = 1;
  
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';
  let currentStart = 0;
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        id: `chunk_${id}`,
        text: currentChunk.trim(),
        start: currentStart,
        end: currentStart + currentChunk.length
      });
      id++;
      
      const overlapStart = Math.max(0, currentChunk.length - overlap);
      currentChunk = currentChunk.substring(overlapStart) + '\n\n' + paragraph;
      currentStart = currentStart + currentChunk.length - overlap - paragraph.length;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push({
      id: `chunk_${id}`,
      text: currentChunk.trim(),
      start: currentStart,
      end: currentStart + currentChunk.length
    });
  }
  
  return chunks;
}

/**
 * Find relevant chunks for a query
 * @param {string} query - User question
 * @param {number} topK - Number of chunks to retrieve
 * @returns {Array<{id: string, text: string, score: number}>}
 */
function findRelevantChunks(query, topK = 5) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
  
  const scoredChunks = documentChunks.map((chunk, index) => {
    const chunkLower = chunk.text.toLowerCase();
    let score = 0;
    
    for (const word of queryWords) {
      const matches = (chunkLower.match(new RegExp(word, 'g')) || []).length;
      score += matches;
    }
    
    if (chunkLower.includes(queryLower)) {
      score += 10;
    }
    
    return { ...chunk, score, index };
  });
  
  scoredChunks.sort((a, b) => b.score - a.score);
  
  return scoredChunks.slice(0, topK).map(c => ({
    id: c.id,
    text: c.text,
    score: c.score,
    index: c.index + 1
  }));
}

/**
 * Ask a question about the document
 * @param {string} question - User's question
 * @param {string} language - Preferred response language
 * @returns {Promise<{answer: string, citations: Array}>}
 */
export async function askAssistant(question, language = 'English') {
  if (!openaiClient) {
    throw new Error('LiteLLM not initialized. Call initializeAssistants() first.');
  }
  
  if (!documentChunks || documentChunks.length === 0) {
    throw new Error('Document not set up. Call setupAssistant() with a PDF first.');
  }
  
  if (!question || question.trim().length === 0) {
    throw new Error('Question cannot be empty');
  }

  try {
    console.log('[LiteLLM] Finding relevant chunks...');
    const relevantChunks = findRelevantChunks(question, 4);
    
    console.log(`[LiteLLM] Found ${relevantChunks.length} relevant chunks`);
    
    const context = relevantChunks.map((chunk, i) => 
      `[${i + 1}] ${chunk.text}`
    ).join('\n\n---\n\n');
    
    const langInstruction = language && language !== 'English' 
      ? `Please provide your entire response in ${language}.`
      : '';
    
    const systemPrompt = `You are a helpful assistant that answers questions based strictly on the provided document context.

Guidelines:
1. Base your answer ONLY on the information from the document context provided below
2. Provide specific citations using the format [1], [2], etc. referencing the relevant chunks
3. If the requested information is not in the document, clearly state: "I don't find this information in the provided document"
4. Be accurate and concise
5. ${langInstruction}
6. If you're uncertain, express that uncertainty

Document Context:
${context}

Question: ${question}`;

    console.log('[LiteLLM] Calling model...');
    
    const response = await openaiClient.chat.completions.create({
      model: currentModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const answer = response.choices[0].message.content;
    console.log('[LiteLLM] Response received');

    const citations = relevantChunks.map((chunk, i) => ({
      index: i + 1,
      quote: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : ''),
      fileId: chunk.id,
      pageNumber: 'Ref'
    }));

    return { answer, citations };
  } catch (error) {
    console.error('[LiteLLM] Ask failed:', error.message);
    throw error;
  }
}

/**
 * Get conversation history (not applicable for LiteLLM RAG)
 * @returns {Array}
 */
export async function getConversationHistory(limit = 20) {
  return [];
}

/**
 * Reset conversation (not applicable for LiteLLM RAG)
 */
export async function resetConversation() {
  return 'lite-thread';
}

/**
 * Cleanup resources
 */
export async function cleanup() {
  documentChunks = [];
  documentInfo = null;
  console.log('[LiteLLM] Cleanup complete');
}

/**
 * Get current status
 */
export function getStatus() {
  return {
    initialized: !!openaiClient,
    hasDocument: documentChunks.length > 0,
    model: currentModel,
    numChunks: documentChunks.length,
    ready: !!(openaiClient && documentChunks.length > 0)
  };
}

/**
 * Check if system is ready
 */
export function isReady() {
  return !!(openaiClient && documentChunks.length > 0);
}
