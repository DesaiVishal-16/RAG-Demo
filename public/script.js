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
    const languageSelect = document.getElementById('language-select');

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
                body: JSON.stringify({ 
                    question,
                    language: languageSelect.value 
                })
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
        languageSelect.disabled = false;
        askInfo.classList.add('hidden');
    }

    // Translations
    const translations = {
        'English': {
            'askHeader': 'Ask a Question',
            'askPlaceholder': 'Ask a question about your PDF...',
            'askBtn': 'Ask Question',
            'sourcesHeader': 'Sources & Citations'
        },
        'Hindi': {
            'askHeader': 'सवाल पूछें',
            'askPlaceholder': 'अपने पीडीएफ के बारे में एक सवाल पूछें...',
            'askBtn': 'सवाल पूछें',
            'sourcesHeader': 'स्रोत और उद्धरण'
        },
        'Marathi': {
            'askHeader': 'प्रश्न विचारा',
            'askPlaceholder': 'तुमच्या पीडीएफ बद्दल प्रश्न विचारा...',
            'askBtn': 'प्रश्न विचारा',
            'sourcesHeader': 'स्रोत आणि उद्धरण'
        },
        'Gujarati': {
            'askHeader': 'પ્રશ્ન પૂછો',
            'askPlaceholder': 'તમારા પીડીએફ વિશે પ્રશ્ન પૂછો...',
            'askBtn': 'પ્રશ્ન પૂછો',
            'sourcesHeader': 'સ્ત્રોતો અને અવતરણો'
        },
        'Tamil': {
            'askHeader': 'கேள்வி கேளுங்கள்',
            'askPlaceholder': 'உங்கள் PDF பற்றி ஒரு கேள்வி கேளுங்கள்...',
            'askBtn': 'கேள்வி கேளுங்கள்',
            'sourcesHeader': 'ஆதாரங்கள் மற்றும் மேற்கோள்கள்'
        },
        'Telugu': {
            'askHeader': 'ప్రశ్న అడగండి',
            'askPlaceholder': 'మీ PDF గురించి ప్రశ్న అడగండి...',
            'askBtn': 'ప్రశ్న అడగండి',
            'sourcesHeader': 'మూలాలు మరియు అనులేఖనాలు'
        },
        'Kannada': {
            'askHeader': 'ಪ್ರಶ್ನೆ ಕೇಳಿ',
            'askPlaceholder': 'ನಿಮ್ಮ PDF ಬಗ್ಗೆ ಪ್ರಶ್ನೆ ಕೇಳಿ...',
            'askBtn': 'ಪ್ರಶ್ನೆ ಕೇಳಿ',
            'sourcesHeader': 'ಮೂಲಗಳು ಮತ್ತು ಉಲ್ಲೇಖಗಳು'
        },
        'Bengali': {
            'askHeader': 'প্রশ্ন জিজ্ঞাসা করুন',
            'askPlaceholder': 'আপনার পিডিএফ সম্পর্কে একটি প্রশ্ন জিজ্ঞাসা করুন...',
            'askBtn': 'প্রশ্ন জিজ্ঞাসা করুন',
            'sourcesHeader': 'উৎস এবং উদ্ধৃতি'
        },
        'Punjabi': {
            'askHeader': 'ਸਵਾਲ ਪੁੱਛੋ',
            'askPlaceholder': 'ਆਪਣੀ ਪੀਡੀਐਫ ਬਾਰੇ ਸਵਾਲ ਪੁੱਛੋ...',
            'askBtn': 'ਸਵਾਲ ਪੁੱਛੋ',
            'sourcesHeader': 'ਸਰੋਤ ਅਤੇ ਹਵਾਲੇ'
        },
        'Malayalam': {
            'askHeader': 'ചോദ്യം ചോദിക്കുക',
            'askPlaceholder': 'നിങ്ങളുടെ PDF-നെ കുറിച്ച് ഒരു ചോദ്യം ചോദിക്കുക...',
            'askBtn': 'ചോദ്യം ചോദിക്കുക',
            'sourcesHeader': 'ഉറവിടങ്ങളും ഉദ്ധരണികളും'
        }
    };

    languageSelect.addEventListener('change', () => {
        const lang = languageSelect.value;
        const t = translations[lang] || translations['English'];
        
        document.querySelector('.ask-question h2').innerHTML = `<i class="fas fa-comments icon"></i> ${t.askHeader}`;
        questionInput.placeholder = t.askPlaceholder;
        askBtn.innerHTML = `<i class="fas fa-paper-plane icon"></i> ${t.askBtn}`;
        document.querySelector('#citations-section h3').textContent = t.sourcesHeader;
    });

    function displayAnswer(data) {
        answerContainer.classList.remove('hidden');
        answerText.textContent = data.answer;

        if (data.citations && data.citations.length > 0) {
            citationsSection.classList.remove('hidden');
            const lang = languageSelect.value;
            const sourceLabel = lang === 'Hindi' ? 'स्रोत' : 
                               lang === 'Marathi' ? 'स्रोत' :
                               lang === 'Gujarati' ? 'સ્ત્રોત' :
                               lang === 'Tamil' ? 'ஆதாரம்' :
                               lang === 'Telugu' ? 'మూలం' :
                               lang === 'Kannada' ? 'ಮೂಲ' :
                               lang === 'Bengali' ? 'উৎস' :
                               lang === 'Punjabi' ? 'ਸਰੋਤ' :
                               lang === 'Malayalam' ? 'ഉറവിടം' : 'Source';
            
            const pageLabel = lang === 'Hindi' ? 'पृष्ठ' : 
                             lang === 'Marathi' ? 'पृष्ठ' :
                             lang === 'Gujarati' ? 'પૃષ્ઠ' :
                             lang === 'Tamil' ? 'பக்கம்' :
                             lang === 'Telugu' ? 'పేజీ' :
                             lang === 'Kannada' ? 'ಪುಟ' :
                             lang === 'Bengali' ? 'পৃষ্ঠা' :
                             lang === 'Punjabi' ? 'ਪੰਨਾ' :
                             lang === 'Malayalam' ? 'പേജ്' : 'Page';

            citationsList.innerHTML = data.citations.map(c => `
                <div class="citation-item">
                    <div class="citation-header">
                        <span class="citation-badge">${sourceLabel} ${c.index}</span>
                        <span class="citation-page">${pageLabel} ${c.pageNumber}</span>
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
