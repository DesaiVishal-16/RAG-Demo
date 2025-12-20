import { useState } from 'react';
import { FaRobot } from 'react-icons/fa';
import { FaCircle } from "react-icons/fa6";
import PdfUpload from './components/PdfUpload';
import AskQuestion from './components/AskQuestion';
import './App.css';

/**
 * Main RAG Demo Application
 */
function App() {
  const [pdfUploaded, setPdfUploaded] = useState(false);

  const handleUploadSuccess = () => {
    setPdfUploaded(true);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1><FaRobot className="header-icon" /> RAG Demo</h1>
          <p className="subtitle">
            Upload a PDF and ask questions with AI-powered answers and citations
          </p>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          <PdfUpload onUploadSuccess={handleUploadSuccess} />
          <AskQuestion pdfUploaded={pdfUploaded} />
        </div>
      </main>

      <footer className="app-footer">
        <p>
          Powered by <strong>Udayam AI Labs</strong> <FaCircle style={{width: '5px', height: '5px'}}/> <strong>RAG Demo</strong>
        </p>
      </footer>
    </div>
  );
}

export default App;
