import OpenAI from 'openai';

/**
 * OpenAI Chat Completion Module
 * Generates text answers using OpenAI's GPT models
 */

let openai;

/**
 * Initialize the OpenAI API client
 * @param {string} apiKey - OpenAI API key
 */
export function initializeChatCompletion(apiKey) {
  openai = new OpenAI({ apiKey });
}

/**
 * Generate an answer based on retrieved document chunks
 * @param {string} question - User's question
 * @param {Array} retrievedChunks - Array of relevant document chunks
 * @returns {Promise<{answer: string, citations: Array}>} - Answer with citations
 */
export async function generateAnswer(question, retrievedChunks) {
  try {
    if (!openai) {
      throw new Error('OpenAI API not initialized. Call initializeChatCompletion first.');
    }

    // Build the context string
    const contextParts = retrievedChunks.map((chunk, index) => {
      return `[Chunk C${index + 1} | Page ${chunk.pageNumber || 'N/A'}]\n${chunk.text}\n`;
    }).join('\n');

    const systemPrompt = `You are a document-grounded assistant.
Answer questions strictly using the provided document context.
If the answer is not found, say:
"Not found in the uploaded document."

RULES:
- Do NOT use external knowledge
- Do NOT hallucinate
- Every answer MUST include citations
- Each citation must refer to a chunk ID and page number
- Format your answer clearly`;

    const userPrompt = `CONTEXT:
${contextParts}

QUESTION:
${question}

RESPONSE FORMAT:
Answer:
<clear, concise answer>

Citations:
- [C1 | Page X]
- [C2 | Page Y]

Now answer the question above:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1024,
      top_p: 0.95,
    });

    const text = completion.choices[0].message.content;

    // Parse the response to extract answer and citations
    const parsed = parseResponse(text, retrievedChunks);
    
    return parsed;
  } catch (error) {
    console.error('Error generating answer:', error);
    throw error;
  }
}

/**
 * Parse the model response to extract answer and citations
 * @param {string} responseText - Raw response from OpenAI
 * @param {Array} chunks - Retrieved chunks for reference
 * @returns {{answer: string, citations: Array}} - Parsed answer and citations
 */
function parseResponse(responseText, chunks) {
  // Try to extract answer and citations from the response
  const answerMatch = responseText.match(/Answer:\s*([\s\S]*?)(?=Citations:|$)/i);
  const citationsMatch = responseText.match(/Citations:\s*([\s\S]*?)$/i);

  let answer = answerMatch ? answerMatch[1].trim() : responseText;
  let citations = [];

  if (citationsMatch) {
    const citationText = citationsMatch[1];
    const citationLines = citationText.split('\n').filter(line => line.trim());
    
    citations = citationLines.map(line => {
      const match = line.match(/\[C(\d+)\s*\|\s*Page\s*(\S+)\]/i);
      if (match) {
        const chunkIndex = parseInt(match[1]) - 1;
        const pageNumber = match[2];
        
        if (chunks[chunkIndex]) {
          return {
            chunkId: chunks[chunkIndex].chunkId,
            pageNumber: pageNumber,
            text: chunks[chunkIndex].text.substring(0, 100) + '...'
          };
        }
      }
      return null;
    }).filter(c => c !== null);
  }

  // If no citations were parsed, create them from retrieved chunks
  // (Only if we really want to force citations, but usually better to trust the model or return empty if none found)
  // The original code forced citations from chunks if none were found, which might be a fallback. I'll keep it for consistency.
  if (citations.length === 0) {
    citations = chunks.map(chunk => ({
      chunkId: chunk.chunkId,
      pageNumber: chunk.pageNumber || 'N/A',
      text: chunk.text.substring(0, 100) + '...'
    }));
  }

  return { answer, citations };
}
