import { useState } from 'react';
import PropTypes from 'prop-types';
import { FaFilePdf, FaCloudUploadAlt, FaCheckCircle, FaExclamationTriangle, FaSpinner } from 'react-icons/fa';
import './PdfUpload.css';

/**
 * PDF Upload Component
 * Handles PDF file upload to the backend
 */
function PdfUpload({ onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [pdfInfo, setPdfInfo] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setError('Please select a PDF file');
        setFile(null);
        return;
      }
      
      setFile(selectedFile);
      setError(null);
      setPdfInfo(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a PDF file');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await fetch('http://localhost:3001/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setPdfInfo(data.info);
      onUploadSuccess && onUploadSuccess(data.info);
      
      // Clear file input after successful upload
      setFile(null);
      document.getElementById('pdf-input').value = '';

    } catch (err) {
      setError(err.message || 'Failed to upload PDF');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="pdf-upload">
      <h2><FaFilePdf className="icon" /> Upload PDF Document</h2>
      
      <div className="upload-container">
        <input
          id="pdf-input"
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          disabled={uploading}
          className="file-input"
        />
        
        {file && (
          <div className="file-info">
            <span className="file-icon"><FaFilePdf /></span>
            <span className="file-name">{file.name}</span>
            <span className="file-size">
              ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </span>
          </div>
        )}
        
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="upload-btn"
        >
          {uploading ? (
            <>
              <FaSpinner className="spinner icon-spin" />
              Processing... (this may take a moment)
            </>
          ) : (
            <><FaCloudUploadAlt className="icon" /> Upload & Process</>
          )}
        </button>
      </div>

      {error && (
        <div className="error-message">
          <FaExclamationTriangle className="icon" /> {error}
        </div>
      )}

      {pdfInfo && (
        <div className="success-message">
          <div className="success-header"><FaCheckCircle className="icon" /> PDF Processed Successfully!</div>
          <div className="pdf-details">
            <div className="detail-item">
              <strong>Filename:</strong> {pdfInfo.filename}
            </div>
            <div className="detail-item">
              <strong>Pages:</strong> {pdfInfo.numPages}
            </div>
            <div className="detail-item">
              <strong>Chunks Created:</strong> {pdfInfo.numChunks}
            </div>
            <div className="detail-item">
              <strong>Upload Time:</strong>{' '}
              {new Date(pdfInfo.uploadDate).toLocaleString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

PdfUpload.propTypes = {
  onUploadSuccess: PropTypes.func,
};

export default PdfUpload;
