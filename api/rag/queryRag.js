import { generateEmbedding } from '../openai/embeddings.js';
import { generateAnswer } from '../openai/chatCompletion.js';
import vectorStore from './vectorStore.js';

/**
 * RAG Query Module
 * Handles the complete RAG query pipeline
 */

/**
 * Query the RAG system with a question
 * @param {string} question - User's question
 * @param {number} topK - Number of chunks to retrieve (default: 5)
 * @returns {Promise<{answer: string, citations: Array, retrievedChunks: Array}>}
 */
export async function queryRAG(question, topK = 5) {
  try {
    // Check if vector store has documents
    if (vectorStore.isEmpty()) {
      throw new Error('No documents in vector store. Please upload a PDF first.');
    }

    console.log(`\n[RAG Query] Question: "${question}"`);
    console.log(`[RAG Query] Retrieving top ${topK} chunks...`);

    // Step 1: Generate embedding for the question
    const questionEmbedding = await generateEmbedding(question);
    console.log(`[RAG Query] Question embedding generated (dimension: ${questionEmbedding.length})`);

    // Step 2: Perform similarity search
    const searchResults = vectorStore.similaritySearch(questionEmbedding, topK);
    console.log(`[RAG Query] Found ${searchResults.length} relevant chunks`);

    if (searchResults.length === 0) {
      return {
        answer: 'No relevant information found in the document.',
        citations: [],
        retrievedChunks: []
      };
    }

    // Log similarity scores
    searchResults.forEach((result, index) => {
      console.log(`  - Chunk ${index + 1}: ${result.chunk.chunkId} (similarity: ${result.similarity.toFixed(4)}, page: ${result.chunk.pageNumber})`);
    });

    // Step 3: Extract chunks for generation
    const retrievedChunks = searchResults.map(result => result.chunk);

    // Step 4: Generate answer using OpenAI
    console.log(`[RAG Query] Generating answer with OpenAI...`);
    const { answer, citations } = await generateAnswer(question, retrievedChunks);
    console.log(`[RAG Query] Answer generated successfully`);

    return {
      answer,
      citations,
      retrievedChunks: searchResults.map(result => ({
        ...result.chunk,
        similarity: result.similarity
      }))
    };
  } catch (error) {
    console.error('[RAG Query] Error:', error);
    throw error;
  }
}
