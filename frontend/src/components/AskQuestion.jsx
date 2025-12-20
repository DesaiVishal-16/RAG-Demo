import { useState } from 'react';
import PropTypes from 'prop-types';
import { FaComments, FaPaperPlane, FaSpinner, FaExclamationTriangle, FaInfoCircle } from 'react-icons/fa';
import AnswerWithCitations from './AnswerWithCitations';
import './AskQuestion.css';

/**
 * Ask Question Component
 * Handles user questions and displays answers with citations
 */
function AskQuestion({ pdfUploaded }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const handleAsk = async () => {
    if (!question.trim()) {
      setError('Please enter a question');
      return;
    }

    if (!pdfUploaded) {
      setError('Please upload a PDF first');
      return;
    }

    setLoading(true);
    setError(null);
    const currentQuestion = question;

    try {
      const response = await fetch('http://localhost:3001/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: currentQuestion }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get answer');
      }

      const newResult = {
        question: currentQuestion,
        answer: data.answer,
        citations: data.citations,
        retrievedChunks: data.retrievedChunks,
        timestamp: new Date().toISOString(),
      };

      setResult(newResult);
      setHistory([newResult, ...history]);
      setQuestion('');

    } catch (err) {
      setError(err.message || 'Failed to get answer');
      console.error('Ask error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div className="ask-question">
      <h2><FaComments className="icon" /> Ask Questions</h2>

      <div className="question-input-container">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask a question about your PDF... (Press Enter to submit)"
          disabled={loading || !pdfUploaded}
          className="question-input"
          rows="3"
        />

        <button
          onClick={handleAsk}
          disabled={!question.trim() || loading || !pdfUploaded}
          className="ask-btn"
        >
          {loading ? (
            <>
              <FaSpinner className="spinner icon-spin" />
              Thinking...
            </>
          ) : (
            <><FaPaperPlane className="icon" /> Ask</>
          )}
        </button>
      </div>

      {error && (
        <div className="error-message">
          <FaExclamationTriangle className="icon" /> {error}
        </div>
      )}

      {!pdfUploaded && (
        <div className="info-message">
          <FaInfoCircle className="icon" /> Please upload a PDF document first to start asking questions
        </div>
      )}

      {result && (
        <div className="current-answer">
          <h3>Latest Answer</h3>
          <AnswerWithCitations
            question={result.question}
            answer={result.answer}
            citations={result.citations}
            retrievedChunks={result.retrievedChunks}
          />
        </div>
      )}

      {history.length > 1 && (
        <div className="history">
          <h3>Previous Questions</h3>
          {history.slice(1).map((item, index) => (
            <div key={index} className="history-item">
              <div className="history-question">
                <strong>Q:</strong> {item.question}
              </div>
              <AnswerWithCitations
                question={item.question}
                answer={item.answer}
                citations={item.citations}
                retrievedChunks={item.retrievedChunks}
                compact
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

AskQuestion.propTypes = {
  pdfUploaded: PropTypes.bool,
};

export default AskQuestion;
