import OpenAI from 'openai';
import fs from 'fs';

let openai;
let currentAssistantId = null;
let currentVectorStoreId = null;
let currentThreadId = null;
let currentFileId = null;

/**
 * Initialize OpenAI client
 * @param {string} apiKey - OpenAI API key
 */
export function initializeAssistants(apiKey) {
  if (!apiKey) {
    throw new Error('API key is required');
  }
  openai = new OpenAI({ apiKey });
  console.log('[Assistant] OpenAI client initialized');
}

/**
 * Setup an Assistant with the uploaded PDF
 * This should be called once when a PDF is uploaded
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<{assistantId: string, vectorStoreId: string, threadId: string, fileId: string}>}
 */
export async function setupAssistant(filePath) {
  if (!openai) {
    throw new Error('OpenAI not initialized. Call initializeAssistants() first.');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  try {
    // Step 1: Upload file to OpenAI
    console.log('[Assistant] Uploading file to OpenAI...');
    const fileStream = fs.createReadStream(filePath);
    const file = await openai.files.create({
      file: fileStream,
      purpose: 'assistants',
    });
    currentFileId = file.id;
    console.log(`[Assistant] File uploaded successfully: ${file.id}`);

    // Step 2: Create a Vector Store
    console.log('[Assistant] Creating Vector Store...');
    const vectorStore = await openai.vectorStores.create({
      name: "RAG Demo Document Store",
      expires_after: {
        anchor: "last_active_at",
        days: 7
      }
    });
    currentVectorStoreId = vectorStore.id;
    console.log(`[Assistant] Vector Store created: ${vectorStore.id}`);

    // Step 3: Add file to Vector Store
    console.log('[Assistant] Adding file to Vector Store...');
    await openai.vectorStores.files.create(
      vectorStore.id,
      { file_id: file.id }
    );
    
    // Step 4: Poll until vector store is ready
    console.log('[Assistant] Waiting for Vector Store to process file...');
    let vsStatus = await openai.vectorStores.retrieve(vectorStore.id);
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max wait
    
    while (vsStatus.status === 'in_progress' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      vsStatus = await openai.vectorStores.retrieve(vectorStore.id);
      attempts++;
    }
    
    if (vsStatus.status !== 'completed') {
      throw new Error(`Vector Store processing failed with status: ${vsStatus.status}`);
    }
    console.log(`[Assistant] Vector Store ready (${vsStatus.file_counts.completed} files processed)`);

    // Step 5: Create Assistant with file_search tool
    console.log('[Assistant] Creating Assistant...');
    const assistant = await openai.beta.assistants.create({
      name: "RAG Demo Assistant",
      instructions: `You are a knowledgeable assistant that answers questions based strictly on the uploaded document.

Guidelines:
1. Always base your answers on information from the document
2. Provide specific citations and quotes from the document to support your answers
3. If the requested information is not in the document, clearly state: "I don't find this information in the provided document"
4. Be accurate and concise
5. When citing, use the exact text from the document
6. If you're uncertain, express that uncertainty
7. For policy or course-related questions, reference specific sections when possible`,
      model: "gpt-4o-mini",
      tools: [{ type: "file_search" }],
      tool_resources: {
        file_search: {
          vector_store_ids: [vectorStore.id]
        }
      },
      temperature: 0.3, // Lower temperature for more consistent, factual responses
    });

    currentAssistantId = assistant.id;
    console.log(`[Assistant] Assistant created: ${assistant.id}`);

    // Step 6: Create a persistent thread for the conversation
    console.log('[Assistant] Creating conversation thread...');
    const thread = await openai.beta.threads.create();
    currentThreadId = thread.id;
    console.log(`[Assistant] Thread created: ${thread.id}`);
    
    return { 
      assistantId: assistant.id, 
      vectorStoreId: vectorStore.id,
      threadId: thread.id,
      fileId: file.id
    };
  } catch (error) {
    console.error('[Assistant] Setup failed:', error.message);
    // Cleanup partial resources if setup fails
    await cleanup();
    throw error;
  }
}

/**
 * Ask a question to the Assistant
 * Can be called multiple times after setup
 * @param {string} question - User's question
 * @returns {Promise<{answer: string, citations: Array<{index: number, quote: string, fileId: string}>}>}
 */
export async function askAssistant(question) {
  if (!openai) {
    throw new Error('OpenAI not initialized. Call initializeAssistants() first.');
  }
  
  if (!currentAssistantId || !currentThreadId) {
    throw new Error('Assistant not set up. Call setupAssistant() with a PDF first.');
  }

  if (!question || question.trim().length === 0) {
    throw new Error('Question cannot be empty');
  }

  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount <= maxRetries) {
    try {
      // 1. Add user's question to the thread
      console.log('[Assistant] Adding question to thread...');
      await openai.beta.threads.messages.create(currentThreadId, {
        role: "user",
        content: question
      });

      // 2. Run the assistant
      console.log('[Assistant] Running assistant...');
      const run = await openai.beta.threads.runs.createAndPoll(currentThreadId, {
        assistant_id: currentAssistantId,
      });

      console.log(`[Assistant] Run completed with status: ${run.status}`);
      
      if (run.status === 'completed') {
        // 3. Retrieve the latest message
        const messages = await openai.beta.threads.messages.list(currentThreadId, {
          limit: 1,
          order: 'desc'
        });
        
        const lastMessage = messages.data[0];
        if (!lastMessage || lastMessage.role !== 'assistant') {
          throw new Error('No assistant response found');
        }

        const textContent = lastMessage.content.find(c => c.type === 'text');
        if (!textContent) return { answer: "No text response.", citations: [] };

        let answer = textContent.text.value;
        const rawCitations = textContent.text.annotations || [];
        const citations = [];
        
        // 4. Process annotations for citations
        // We avoid calling steps.list to stay within Free Tier rate limits (3 RPM)
        for (let i = 0; i < rawCitations.length; i++) {
          const annotation = rawCitations[i];
          if (annotation.type === 'file_citation') {
            const fileId = annotation.file_citation.file_id;
            
            const citation = {
              index: i + 1,
              quote: annotation.file_citation.quote || 'Source text from document',
              fileId: fileId,
              pageNumber: 'Ref' // Page numbers require steps.list which we skip for rate limits
            };
            
            citations.push(citation);
            // Replace the complex marker 【...】 with a clean [1]
            answer = answer.replace(annotation.text, ` [${i + 1}]`);
          }
        }

        return { answer, citations };
      } else {
        const errorMsg = run.last_error ? `${run.last_error.code}: ${run.last_error.message}` : run.status;
        throw new Error(`Assistant run failed: ${errorMsg}`);
      }
    } catch (error) {
      if (error.message.includes('rate_limit_exceeded') && retryCount < maxRetries) {
        retryCount++;
        const waitTime = 20000; // Wait 20 seconds as suggested by OpenAI
        console.warn(`[Assistant] Rate limit hit. Retrying in ${waitTime/1000}s... (Attempt ${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      console.error('[Assistant] Ask failed:', error.message);
      throw error;
    }
  }
}

/**
 * Get the conversation history from the current thread
 * @param {number} limit - Maximum number of messages to retrieve (default: 20)
 * @returns {Promise<Array<{role: string, content: string, timestamp: number}>>}
 */
export async function getConversationHistory(limit = 20) {
  if (!openai || !currentThreadId) {
    throw new Error('No active conversation thread');
  }

  try {
    const messages = await openai.beta.threads.messages.list(currentThreadId, {
      limit,
      order: 'desc'
    });

    return messages.data.map(msg => ({
      role: msg.role,
      content: msg.content[0]?.text?.value || '',
      timestamp: msg.created_at
    })).reverse(); // Return in chronological order
  } catch (error) {
    console.error('[Assistant] Failed to get conversation history:', error.message);
    throw error;
  }
}

/**
 * Reset the conversation while keeping the same assistant and document
 * @returns {Promise<string>} New thread ID
 */
export async function resetConversation() {
  if (!openai) {
    throw new Error('OpenAI not initialized');
  }

  if (!currentAssistantId) {
    throw new Error('No assistant to reset conversation for');
  }

  try {
    console.log('[Assistant] Resetting conversation...');
    const thread = await openai.beta.threads.create();
    currentThreadId = thread.id;
    console.log(`[Assistant] New conversation thread created: ${thread.id}`);
    return thread.id;
  } catch (error) {
    console.error('[Assistant] Reset conversation failed:', error.message);
    throw error;
  }
}

/**
 * Cleanup all resources
 * Call this when you're done with the assistant or want to upload a new document
 */
export async function cleanup() {
  if (!openai) {
    console.log('[Assistant] Nothing to cleanup');
    return;
  }

  const errors = [];

  try {
    // Delete assistant
    if (currentAssistantId) {
      try {
        await openai.beta.assistants.delete(currentAssistantId);
        console.log('[Assistant] Assistant deleted');
      } catch (err) {
        errors.push(`Failed to delete assistant: ${err.message}`);
      }
    }

    // Delete vector store (this also deletes associated file references)
    if (currentVectorStoreId) {
      try {
        await openai.vectorStores.delete(currentVectorStoreId);
        console.log('[Assistant] Vector Store deleted');
      } catch (err) {
        errors.push(`Failed to delete vector store: ${err.message}`);
      }
    }

    // Delete uploaded file
    if (currentFileId) {
      try {
        await openai.files.delete(currentFileId);
        console.log('[Assistant] File deleted');
      } catch (err) {
        errors.push(`Failed to delete file: ${err.message}`);
      }
    }

    // Note: Threads are automatically deleted after inactivity
    // but we can clear the reference
    if (currentThreadId) {
      console.log('[Assistant] Thread reference cleared (will auto-delete after inactivity)');
    }

  } catch (error) {
    errors.push(`Cleanup error: ${error.message}`);
  } finally {
    // Reset all state
    currentAssistantId = null;
    currentVectorStoreId = null;
    currentThreadId = null;
    currentFileId = null;
    
    if (errors.length > 0) {
      console.warn('[Assistant] Cleanup completed with errors:', errors);
    } else {
      console.log('[Assistant] Cleanup completed successfully');
    }
  }
}

/**
 * Get the current status of the assistant system
 * @returns {Object} Status information
 */
export function getStatus() {
  return {
    initialized: !!openai,
    hasAssistant: !!currentAssistantId,
    hasVectorStore: !!currentVectorStoreId,
    hasThread: !!currentThreadId,
    hasFile: !!currentFileId,
    assistantId: currentAssistantId,
    vectorStoreId: currentVectorStoreId,
    threadId: currentThreadId,
    fileId: currentFileId,
    ready: !!(openai && currentAssistantId && currentThreadId)
  };
}

/**
 * Check if the system is ready to answer questions
 * @returns {boolean}
 */
export function isReady() {
  return !!(openai && currentAssistantId && currentThreadId);
}