/**
 * Vector Store Module
 * In-memory vector store with cosine similarity search
 */

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} - Cosine similarity (-1 to 1)
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * In-memory Vector Store class
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_PATH = path.join(__dirname, '../vector_store.json');

/**
 * In-memory Vector Store class with Local Persistence
 */
class VectorStore {
  constructor() {
    this.documents = [];
    this.embeddings = [];
    this.loadFromFile(); // Attempt to load on initialization
  }

  /**
   * Save current store to local file
   */
  async saveToFile() {
    try {
      const data = {
        documents: this.documents,
        embeddings: this.embeddings
      };
      await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2));
      console.log(`💾 Vector store saved to ${STORE_PATH}`);
    } catch (error) {
      console.error('Failed to save vector store:', error);
    }
  }

  /**
   * Load store from local file
   */
  async loadFromFile() {
    try {
      const exists = await fs.access(STORE_PATH).then(() => true).catch(() => false);
      if (exists) {
        const data = JSON.parse(await fs.readFile(STORE_PATH, 'utf-8'));
        this.documents = data.documents || [];
        this.embeddings = data.embeddings || [];
        console.log(`📂 Loaded ${this.documents.length} documents from local vector store`);
      }
    } catch (error) {
      console.error('Failed to load vector store:', error);
    }
  }

  /**
   * Add documents with their embeddings to the store
   * @param {Array<{chunkId: string, pageNumber: number, text: string}>} chunks - Document chunks
   * @param {Array<number[]>} embeddings - Corresponding embeddings
   */
  async addDocuments(chunks, embeddings) {
    if (chunks.length !== embeddings.length) {
      throw new Error('Number of chunks must match number of embeddings');
    }

    this.documents = chunks;
    this.embeddings = embeddings;
    await this.saveToFile(); // Auto-save when updated
  }

  /**
   * Search for similar documents using cosine similarity
   * @param {number[]} queryEmbedding - Query embedding vector
   * @param {number} topK - Number of top results to return (default: 5)
   * @returns {Array<{chunk: object, similarity: number}>} - Top K similar chunks
   */
  similaritySearch(queryEmbedding, topK = 5) {
    if (this.documents.length === 0) {
      return [];
    }

    // Calculate similarity scores for all documents
    const scores = this.embeddings.map((embedding, index) => ({
      chunk: this.documents[index],
      similarity: cosineSimilarity(queryEmbedding, embedding)
    }));

    // Sort by similarity (descending) and return top K
    scores.sort((a, b) => b.similarity - a.similarity);
    
    return scores.slice(0, topK);
  }

  /**
   * Clear the vector store
   */
  async clear() {
    this.documents = [];
    this.embeddings = [];
    await this.saveToFile();
  }

  /**
   * Get the number of documents in the store
   * @returns {number} - Document count
   */
  size() {
    return this.documents.length;
  }

  /**
   * Check if the store is empty
   * @returns {boolean} - True if empty
   */
  isEmpty() {
    return this.documents.length === 0;
  }
}

// Singleton instance
const vectorStore = new VectorStore();

export default vectorStore;
