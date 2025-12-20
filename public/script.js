document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const pdfInput = document.getElementById('pdf-input');
    const fileInfo = document.getElementById('file-info');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const uploadBtn = document.getElementById('upload-btn');
    const uploadError = document.getElementById('upload-error');
    const uploadSuccess = document.getElementById('upload-success');
    const pdfDetails = document.getElementById('pdf-details');
    
    const questionInput = document.getElementById('question-input');
    const askBtn = document.getElementById('ask-btn');
    const askError = document.getElementById('ask-error');
    const askInfo = document.getElementById('ask-info');
    const answerContainer = document.getElementById('answer-container');
    const answerText = document.getElementById('answer-text');
    const citationsSection = document.getElementById('citations-section');
    const citationsList = document.getElementById('citations-list');

    // State
    let selectedFile = null;
    let isPdfUploaded = false;

    // File Selection
    pdfInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.type !== 'application/pdf') {
                showError(uploadError, 'Please select a PDF file');
                selectedFile = null;
                fileInfo.classList.add('hidden');
                uploadBtn.disabled = true;
                return;
            }

            selectedFile = file;
            fileName.textContent = file.name;
            fileSize.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;
            fileInfo.classList.remove('hidden');
            uploadError.classList.add('hidden');
            uploadBtn.disabled = false;
        }
    });

    // Upload Handler
    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        setLoading(uploadBtn, true, 'Processing...');
        uploadError.classList.add('hidden');
        uploadSuccess.classList.add('hidden');

        const formData = new FormData();
        formData.append('pdf', selectedFile);

        try {
            const response = await fetch('/upload-pdf', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Upload failed');

            // Success
            isPdfUploaded = true;
            showPdfDetails(data.info);
            enableQuestionInput();
            
            // Reset file input
            selectedFile = null;
            pdfInput.value = '';
            fileInfo.classList.add('hidden');
            uploadBtn.disabled = true;

        } catch (err) {
            showError(uploadError, err.message);
        } finally {
            setLoading(uploadBtn, false, 'Upload & Process', '<i class="fas fa-cloud-upload-alt icon"></i>');
        }
    });

    // Question Handler
    askBtn.addEventListener('click', handleAsk);
    questionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAsk();
        }
    });

    questionInput.addEventListener('input', () => {
        askBtn.disabled = !questionInput.value.trim() || !isPdfUploaded;
    });

    async function handleAsk() {
        const question = questionInput.value.trim();
        if (!question || !isPdfUploaded) return;

        setLoading(askBtn, true, 'Thinking...');
        askError.classList.add('hidden');
        
        try {
            const response = await fetch('/ask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ question })
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.details && data.details.includes('rate_limit_exceeded')) {
                    throw new Error('OpenAI Rate Limit reached. Please wait 20-30 seconds and try again. (Free Tier limit: 3 requests per minute)');
                }
                throw new Error(data.error || 'Failed to get answer');
            }

            displayAnswer(data);
            questionInput.value = '';
            askBtn.disabled = true;

        } catch (err) {
            showError(askError, err.message);
        } finally {
            setLoading(askBtn, false, 'Ask Question', '<i class="fas fa-paper-plane icon"></i>');
        }
    }

    // Helper Functions
    function setLoading(btn, isLoading, text, iconHtml = '') {
        btn.disabled = isLoading;
        btn.innerHTML = isLoading 
            ? `<i class="fas fa-spinner icon-spin"></i> ${text}`
            : `${iconHtml} ${text}`;
    }

    function showError(element, message) {
        element.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
        element.classList.remove('hidden');
    }

    function showPdfDetails(info) {
        uploadSuccess.classList.remove('hidden');
        pdfDetails.innerHTML = `
            <div class="detail-item"><strong>Filename:</strong> ${info.filename}</div>
            <div class="detail-item"><strong>Status:</strong> Assistant Ready</div>
        `;
    }

    function enableQuestionInput() {
        questionInput.disabled = false;
        askInfo.classList.add('hidden');
    }

    function displayAnswer(data) {
        answerContainer.classList.remove('hidden');
        answerText.textContent = data.answer;

        if (data.citations && data.citations.length > 0) {
            citationsSection.classList.remove('hidden');
            citationsList.innerHTML = data.citations.map(c => `
                <div class="citation-item">
                    <div class="citation-header">
                        <span class="citation-badge">Source ${c.index}</span>
                        <span class="citation-page">Page ${c.pageNumber}</span>
                    </div>
                    <div class="citation-text">"${c.text}"</div>
                </div>
            `).join('');
        } else {
            citationsSection.classList.add('hidden');
        }
        
        // Scroll to answer
        answerContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
});
