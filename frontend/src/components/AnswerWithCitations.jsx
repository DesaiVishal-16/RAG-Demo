import { useState } from 'react';
import PropTypes from 'prop-types';
import { FaBook, FaSearch, FaChevronDown, FaChevronRight, FaLightbulb } from 'react-icons/fa';
import './AnswerWithCitations.css';

/**
 * Answer with Citations Component
 * Displays AI-generated answers with source citations
 */
function AnswerWithCitations({ question, answer, citations, retrievedChunks, compact = false }) {
  const [expandedChunks, setExpandedChunks] = useState({});

  const toggleChunk = (chunkId) => {
    setExpandedChunks(prev => ({
      ...prev,
      [chunkId]: !prev[chunkId]
    }));
  };

  return (
    <div className={`answer-container ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="question-display">
          <strong>Question:</strong> {question}
        </div>
      )}

      <div className="answer-section">
        <div className="answer-label"><FaLightbulb className="icon" /> Answer:</div>
        <div className="answer-text">{answer}</div>
      </div>

      {citations && citations.length > 0 && (
        <div className="citations-section">
          <div className="citations-label"><FaBook className="icon" /> Citations:</div>
          <div className="citations-list">
            {citations.map((citation, index) => (
              <div key={index} className="citation-item">
                <div className="citation-header">
                  <span className="citation-badge">
                    [{citation.chunkId}]
                  </span>
                  <span className="citation-page">
                    Page {citation.pageNumber}
                  </span>
                </div>
                {citation.text && (
                  <div className="citation-preview">
                    {citation.text}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!compact && retrievedChunks && retrievedChunks.length > 0 && (
        <div className="chunks-section">
          <div className="chunks-label">
            <FaSearch className="icon" /> Retrieved Context ({retrievedChunks.length} chunks)
          </div>
          <div className="chunks-list">
            {retrievedChunks.map((chunk, index) => (
              <div key={index} className="chunk-item">
                <div className="chunk-header" onClick={() => toggleChunk(chunk.chunkId)}>
                  <div className="chunk-info">
                    <span className="chunk-id">{chunk.chunkId}</span>
                    <span className="chunk-page">Page {chunk.pageNumber}</span>
                    {chunk.similarity !== undefined && (
                      <span className="chunk-similarity">
                        Similarity: {(chunk.similarity * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <span className="expand-icon">
                    {expandedChunks[chunk.chunkId] ? <FaChevronDown /> : <FaChevronRight />}
                  </span>
                </div>
                
                {!expandedChunks[chunk.chunkId] && chunk.preview && (
                  <div className="chunk-preview">{chunk.preview}</div>
                )}
                
                {expandedChunks[chunk.chunkId] && (
                  <div className="chunk-full-text">
                    {chunk.text || chunk.preview}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

AnswerWithCitations.propTypes = {
  question: PropTypes.string.isRequired,
  answer: PropTypes.string.isRequired,
  citations: PropTypes.arrayOf(
    PropTypes.shape({
      chunkId: PropTypes.string,
      pageNumber: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      text: PropTypes.string,
    })
  ),
  retrievedChunks: PropTypes.arrayOf(
    PropTypes.shape({
      chunkId: PropTypes.string,
      pageNumber: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      similarity: PropTypes.number,
      preview: PropTypes.string,
      text: PropTypes.string,
    })
  ),
  compact: PropTypes.bool,
};

export default AnswerWithCitations;
