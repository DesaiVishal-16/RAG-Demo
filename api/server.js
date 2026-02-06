import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import dotenv from 'dotenv';

import { 
  initializeAssistants, 
  setupAssistant, 
  askAssistant,
  getStatus,
  isReady,
  cleanup
} from './huggingface/litellm.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

const HUGGING_FACE_API_KEY = process.env.HUGGING_FACE_API_KEY;
const HF_MODEL = process.env.HF_MODEL || 'moonshotai/Kimi-K2-Thinking-hugging';

if (!HUGGING_FACE_API_KEY) {
  console.error('ERROR: HUGGING_FACE_API_KEY not found in environment variables');
  console.error('Please create a .env file with your Hugging Face API key');
  process.exit(1);
}

initializeAssistants(HUGGING_FACE_API_KEY, HF_MODEL);
console.log('✓ Hugging Face LiteLLM initialized');
console.log('✓ Model:', HF_MODEL);

let currentPDFInfo = null;

app.get('/health', (req, res) => {
  const status = getStatus();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    pdfUploaded: currentPDFInfo !== null,
    assistantStatus: status
  });
});

app.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log(`\n[Upload] Processing PDF: ${req.file.originalname}`);
    const filePath = req.file.path;

    if (currentPDFInfo) {
      console.log('[Upload] Cleaning up previous document...');
      await cleanup();
    }

    console.log('[Upload] Setting up document with LiteLLM...');
    const result = await setupAssistant(filePath);
    console.log('[Upload] Document ready:', result);

    currentPDFInfo = {
      filename: result.filename,
      uploadDate: new Date().toISOString(),
      numPages: result.numPages,
      numChunks: result.numChunks
    };

    console.log('[Upload] Setup complete\n');

    res.json({
      success: true,
      message: 'PDF processed successfully',
      info: {
        filename: currentPDFInfo.filename,
        uploadDate: currentPDFInfo.uploadDate,
        numPages: result.numPages,
        numChunks: result.numChunks
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

app.post('/ask', async (req, res) => {
  try {
    const { question, language } = req.body;

    console.log('\n[Ask] Received request');
    console.log('[Ask] Question:', question);
    console.log('[Ask] Language:', language || 'English');

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const status = getStatus();
    console.log('[Ask] Current status:', status);

    if (!isReady()) {
      return res.status(400).json({
        error: 'No PDF uploaded or assistant not ready. Please upload a PDF first.',
        status: status
      });
    }

    console.log(`[Ask] Processing question: "${question}" in ${language || 'English'}`);

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
        chunkId: c.fileId,
        pageNumber: c.pageNumber,
        text: c.quote
      })),
      retrievedChunks: result.citations.map((c, i) => ({
        id: `chunk_${i + 1}`,
        text: c.quote,
        metadata: {
          source: 'Hugging Face LiteLLM RAG',
          chunkId: c.fileId
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

app.get('/status', (req, res) => {
  res.json({
    success: true,
    status: getStatus(),
    currentPDF: currentPDFInfo,
    isReady: isReady()
  });
});

app.use(express.static(path.join(__dirname, '../public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    details: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 RAG Demo Server Started');
  console.log('='.repeat(50));
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🤖 Model: ${HF_MODEL}`);
  console.log(`📄 API Endpoints:`);
  console.log(`   - GET  /health       - Health check`);
  console.log(`   - POST /upload-pdf   - Upload PDF`);
  console.log(`   - POST /ask          - Ask question`);
  console.log(`   - GET  /current-pdf  - Current PDF info`);
  console.log(`   - GET  /status       - System status`);
  console.log(`   - POST /cleanup      - Cleanup resources`);
  console.log('='.repeat(50) + '\n');
});
