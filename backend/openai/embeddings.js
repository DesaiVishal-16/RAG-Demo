import OpenAI from 'openai';

/**
 * OpenAI Embeddings Module
 * Generates text embeddings using OpenAI's embedding models
 */

let openai;

/**
 * Initialize the OpenAI API client
 * @param {string} apiKey - OpenAI API key
 */
export function initializeEmbeddings(apiKey) {
  openai = new OpenAI({ apiKey });
}

/**
 * Generate embedding for a single text with retry logic
 * @param {string} text - Text to generate embedding for
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<number[]>} - Embedding vector
 */
export async function generateEmbedding(text, maxRetries = 3) {
  if (!openai) {
    throw new Error('OpenAI API not initialized. Call initializeEmbeddings first.');
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      const isRateLimitError = error.status === 429;
      
      if (isRateLimitError && attempt < maxRetries) {
        // Exponential backoff
        const waitTime = Math.pow(2, attempt) * 1000;
        
        console.warn(`⚠️  Rate limit hit. Waiting ${(waitTime / 1000).toFixed(1)}s before retry ${attempt + 1}/${maxRetries}...`);
        await sleep(waitTime);
        continue;
      }
      
      console.error('Error generating embedding:', error.message);
      throw error;
    }
  }
}

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate embeddings for multiple texts in batch with rate limiting
 * @param {string[]} texts - Array of texts to generate embeddings for
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export async function generateEmbeddings(texts) {
  try {
    const embeddings = [];
    const BATCH_SIZE = 20; // OpenAI can handle larger batches
    const DELAY_BETWEEN_BATCHES = 500; // 0.5s delay
    
    console.log(`Processing ${texts.length} embeddings in batches of ${BATCH_SIZE}...`);
    
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(texts.length / BATCH_SIZE);
      
      console.log(`  Batch ${batchNumber}/${totalBatches}: Processing ${batch.length} embeddings...`);
      
      try {
        const response = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: batch,
        });
        
        // Ensure embeddings are in the correct order
        const batchEmbeddings = response.data.sort((a, b) => a.index - b.index).map(item => item.embedding);
        embeddings.push(...batchEmbeddings);
        
      } catch (error) {
        console.error(`Error processing batch ${batchNumber}:`, error);
        // Fallback to individual processing if batch fails (e.g. one text too long)
        console.log('Falling back to individual processing for this batch...');
        for (const text of batch) {
          const embedding = await generateEmbedding(text);
          embeddings.push(embedding);
        }
      }
      
      // Delay between batches
      if (i + BATCH_SIZE < texts.length) {
        await sleep(DELAY_BETWEEN_BATCHES);
      }
    }
    
    console.log(`✓ Completed all ${embeddings.length} embeddings`);
    return embeddings;
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw error;
  }
}
