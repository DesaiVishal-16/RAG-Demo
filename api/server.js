import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import dotenv from 'dotenv';

// Import Assistants module
import { 
  initializeAssistants, 
  setupAssistant, 
  askAssistant,
  getStatus,
  isReady,
  cleanup
} from './openai/assistants.js';

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

initializeAssistants(OPENAI_API_KEY);
console.log('✓ OpenAI Assistants API initialized');

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

  const envUser = process.env.ADMIN_USERNAME || 'admin';
  const envPass = process.env.ADMIN_PASSWORD || 'admin4321';

  if (user === envUser && pass === envPass) {
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
  const status = getStatus();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    pdfUploaded: currentPDFInfo !== null,
    assistantStatus: status
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

    // Cleanup previous assistant if exists
    if (currentPDFInfo) {
      console.log('[Upload] Cleaning up previous assistant...');
      await cleanup();
    }

    // Setup Assistant with the file - THIS IS THE FIX!
    console.log('[Upload] Setting up OpenAI Assistant...');
    const result = await setupAssistant(filePath);
    console.log(`[Upload] Assistant ready:`, result);

    // Store PDF info with all the details
    currentPDFInfo = {
      filename: req.file.originalname,
      uploadDate: new Date().toISOString(),
      assistantId: result.assistantId,
      vectorStoreId: result.vectorStoreId,
      threadId: result.threadId,
      fileId: result.fileId
    };

    // Clean up uploaded file
    await fs.unlink(filePath);
    console.log('[Upload] Cleanup complete\n');

    res.json({
      success: true,
      message: 'PDF processed successfully',
      info: {
        filename: currentPDFInfo.filename,
        uploadDate: currentPDFInfo.uploadDate,
        numPages: 'N/A (Managed by OpenAI)',
        numChunks: 'N/A (Managed by OpenAI)',
        assistantId: result.assistantId
      }
    });

  } catch (error) {
    console.error('[Upload] Error:', error);
    res.status(500).json({
      error: 'Failed to process PDF',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /ask
 * Ask a question about the uploaded PDF
 */
app.post('/ask', async (req, res) => {
  try {
    const { question, language } = req.body;

    console.log('\n[Ask] Received request');
    console.log('[Ask] Question:', question);
    console.log('[Ask] Language:', language || 'English');

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Check if system is ready
    const status = getStatus();
    console.log('[Ask] Current status:', status);

    if (!isReady()) {
      return res.status(400).json({
        error: 'No PDF uploaded or assistant not ready. Please upload a PDF first.',
        status: status
      });
    }

    console.log(`[Ask] Processing question: "${question}" in ${language || 'English'}`);

    // Query the Assistant
    const result = await askAssistant(question, language);

    console.log('[Ask] Response received');
    console.log('[Ask] Answer length:', result.answer.length);
    console.log('[Ask] Citations count:', result.citations.length);

    res.json({
      success: true,
      question: question,
      answer: result.answer,
      citations: result.citations.map((c, i) => ({
        index: c.index,
        chunkId: `source_${c.index}`,
        pageNumber: c.pageNumber || 'Ref',
        text: c.quote,
        fileId: c.fileId
      })),
      retrievedChunks: result.citations.map((c, i) => ({
        id: `chunk_${i + 1}`,
        text: c.quote,
        metadata: {
          source: 'OpenAI Vector Store',
          fileId: c.fileId
        }
      }))
    });

  } catch (error) {
    console.error('[Ask] Error occurred:', error);
    console.error('[Ask] Error message:', error.message);
    console.error('[Ask] Error stack:', error.stack);
    
    res.status(500).json({
      error: 'Failed to process question',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
    pdf: currentPDFInfo,
    systemStatus: getStatus()
  });
});

/**
 * POST /cleanup
 * Cleanup current assistant and PDF
 */
app.post('/cleanup', async (req, res) => {
  try {
    await cleanup();
    currentPDFInfo = null;
    res.json({
      success: true,
      message: 'Cleanup completed successfully'
    });
  } catch (error) {
    console.error('[Cleanup] Error:', error);
    res.status(500).json({
      error: 'Cleanup failed',
      details: error.message
    });
  }
});

/**
 * GET /status
 * Get detailed system status
 */
app.get('/status', (req, res) => {
  res.json({
    success: true,
    status: getStatus(),
    currentPDF: currentPDFInfo,
    isReady: isReady()
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
    details: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
  console.log(`   - GET  /status       - System status`);
  console.log(`   - POST /cleanup      - Cleanup resources`);
  console.log('='.repeat(50) + '\n');
});