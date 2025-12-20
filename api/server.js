import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import dotenv from 'dotenv';

// Import RAG modules
import { loadPDFByPages } from './rag/pdfLoader.js';
import { splitPagedTextIntoChunks, createChunkObjects } from './rag/textSplitter.js';
import vectorStore from './rag/vectorStore.js';
import { queryRAG } from './rag/queryRag.js';

// Import OpenAI modules
import { initializeEmbeddings, generateEmbeddings } from './openai/embeddings.js';
import { initializeChatCompletion } from './openai/chatCompletion.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'upload-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Initialize OpenAI API
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY not found in environment variables');
  console.error('Please create a .env file with your OpenAI API key');
  process.exit(1);
}

initializeEmbeddings(OPENAI_API_KEY);
initializeChatCompletion(OPENAI_API_KEY);

console.log('✓ OpenAI API initialized');

// Basic Authentication Middleware
const basicAuth = (req, res, next) => {
  // Skip authentication for API endpoints
  const publicPaths = ['/health', '/upload-pdf', '/ask', '/current-pdf'];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
    return res.status(401).send('Authentication required');
  }

  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];

  if (user === 'admin' && pass === 'admin4321') {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
    return res.status(401).send('Authentication required');
  }
};

// Apply Basic Auth to all routes
app.use(basicAuth);



// Store current PDF info
let currentPDFInfo = null;

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    pdfUploaded: currentPDFInfo !== null,
    documentsInStore: vectorStore.size()
  });
});

/**
 * POST /upload-pdf
 * Upload and process a PDF file
 */
app.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log(`\n[Upload] Processing PDF: ${req.file.originalname}`);
    const filePath = req.file.path;

    // Step 1: Load PDF and extract text by pages
    console.log('[Upload] Step 1: Extracting text from PDF...');
    const pages = await loadPDFByPages(filePath);
    console.log(`[Upload] Extracted ${pages.length} pages`);

    // Step 2: Split text into chunks
    console.log('[Upload] Step 2: Splitting text into chunks...');
    const rawChunks = splitPagedTextIntoChunks(pages, 2000, 200);
    const chunks = createChunkObjects(rawChunks);
    console.log(`[Upload] Created ${chunks.length} chunks`);

    // Step 3: Generate embeddings for all chunks
    console.log('[Upload] Step 3: Generating embeddings...');
    const chunkTexts = chunks.map(chunk => chunk.text);
    const embeddings = await generateEmbeddings(chunkTexts);
    console.log(`[Upload] Generated ${embeddings.length} embeddings`);

    // Step 4: Store in vector store
    console.log('[Upload] Step 4: Storing in vector database (local file)...');
    await vectorStore.clear(); // Clear previous document
    await vectorStore.addDocuments(chunks, embeddings);
    console.log(`[Upload] Vector store saved locally with ${vectorStore.size()} documents`);

    // Store PDF info
    currentPDFInfo = {
      filename: req.file.originalname,
      uploadDate: new Date().toISOString(),
      numPages: pages.length,
      numChunks: chunks.length
    };

    // Clean up uploaded file
    await fs.unlink(filePath);
    console.log('[Upload] Cleanup complete\n');

    res.json({
      success: true,
      message: 'PDF processed successfully',
      info: currentPDFInfo
    });

  } catch (error) {
    console.error('[Upload] Error:', error);
    res.status(500).json({
      error: 'Failed to process PDF',
      details: error.message
    });
  }
});

/**
 * POST /ask
 * Ask a question about the uploaded PDF
 */
app.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    if (vectorStore.isEmpty()) {
      return res.status(400).json({
        error: 'No PDF uploaded. Please upload a PDF first.'
      });
    }

    console.log(`\n[Ask] Processing question: "${question}"`);

    // Query the RAG system
    const result = await queryRAG(question, 5);

    console.log('[Ask] Response ready\n');

    res.json({
      success: true,
      question: question,
      answer: result.answer,
      citations: result.citations,
      retrievedChunks: result.retrievedChunks.map(chunk => ({
        chunkId: chunk.chunkId,
        pageNumber: chunk.pageNumber,
        similarity: chunk.similarity,
        preview: chunk.text.substring(0, 150) + '...'
      }))
    });

  } catch (error) {
    console.error('[Ask] Error:', error);
    res.status(500).json({
      error: 'Failed to process question',
      details: error.message
    });
  }
});

/**
 * GET /current-pdf
 * Get information about the currently loaded PDF
 */
app.get('/current-pdf', (req, res) => {
  if (!currentPDFInfo) {
    return res.status(404).json({
      error: 'No PDF currently loaded'
    });
  }

  res.json({
    success: true,
    pdf: currentPDFInfo
  });
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// The "catchall" handler: for any request that doesn't
// match one above, send back index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    details: error.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 RAG Demo Server Started');
  console.log('='.repeat(50));
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`📄 API Endpoints:`);
  console.log(`   - GET  /health       - Health check`);
  console.log(`   - POST /upload-pdf   - Upload PDF`);
  console.log(`   - POST /ask          - Ask question`);
  console.log(`   - GET  /current-pdf  - Current PDF info`);
  console.log('='.repeat(50) + '\n');
});
