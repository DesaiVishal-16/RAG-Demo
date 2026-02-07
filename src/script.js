document.addEventListener('DOMContentLoaded', () => {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
  const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-1.5-pro';
  const CHUNK_SIZE = Number(import.meta.env.VITE_CHUNK_SIZE) || 1000;
  const CHUNK_OVERLAP = Number(import.meta.env.VITE_CHUNK_OVERLAP) || 200;
  const TOP_K_CHUNKS = Number(import.meta.env.VITE_TOP_K_CHUNKS) || 4;
  const MAX_TOKENS = Number(import.meta.env.VITE_MAX_TOKENS) || 2000;
  const TEMPERATURE = Number(import.meta.env.VITE_TEMPERATURE) || 0.3;

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

  const languageWrapper = document.getElementById('languageWrapper');
  const languageTrigger = document.getElementById('languageTrigger');
  const selectedLanguage = document.getElementById('selectedLanguage');

  let isDropdownOpen = false;
  let selectedFile = null;
  let isPdfUploaded = false;
  let documentChunks = [];
  let documentInfo = null;

  languageTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    isDropdownOpen = !isDropdownOpen;
    languageWrapper.classList.toggle('open', isDropdownOpen);
  });

  document.addEventListener('click', (e) => {
    if (!languageWrapper.contains(e.target)) {
      isDropdownOpen = false;
      languageWrapper.classList.remove('open');
    }
  });

  const allOptions = document.querySelectorAll('.language-custom-option');
  allOptions.forEach((option) => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const selectedValue = option.getAttribute('data-value');
      const selectedText = option.querySelector('.language-name').textContent;
      const hiddenSelect = document.getElementById('language-select');
      hiddenSelect.value = selectedValue;
      selectedLanguage.textContent = selectedText;
      const changeEvent = new Event('change', { bubbles: true });
      hiddenSelect.dispatchEvent(changeEvent);
      isDropdownOpen = false;
      languageWrapper.classList.remove('open');
      allOptions.forEach((opt) => opt.classList.remove('selected'));
      option.classList.add('selected');
    });
  });

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

  uploadBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    setLoading(uploadBtn, true, 'Processing...');
    uploadError.classList.add('hidden');
    uploadSuccess.classList.add('hidden');

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const base64Pdf = arrayBufferToBase64(arrayBuffer);

      const apiKey = GEMINI_API_KEY;
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Process this PDF document. Extract and summarize the key information. Just respond with "PDF processed successfully" if you can read it.' }
            ],
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Pdf
            }
          }],
          generationConfig: {
            maxOutputTokens: 100,
            temperature: 0.1
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to process PDF');
      }

      documentChunks = await extractTextFromPdf(base64Pdf);
      
      documentInfo = {
        filename: selectedFile.name,
        numPages: 0,
        numChunks: documentChunks.length
      };

      isPdfUploaded = true;
      showPdfDetails(documentInfo);
      enableQuestionInput();

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

  async function extractTextFromPdf(base64Pdf) {
    const apiKey = GEMINI_API_KEY;
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Extract ALL text from this PDF document. Return the complete text content, preserving paragraphs and structure. Do not summarize - return everything.' }
          ],
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Pdf
          }
        }],
        generationConfig: {
          maxOutputTokens: 32768,
          temperature: 0.1
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to extract text from PDF');
    }

    const result = await response.json();
    const fullText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return createChunks(fullText, CHUNK_SIZE, CHUNK_OVERLAP);
  }

  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function createChunks(text, chunkSize = 1000, overlap = 200) {
    const chunks = [];
    let id = 1;
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';
    let currentStart = 0;

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
        chunks.push({
          id: `chunk_${id}`,
          text: currentChunk.trim(),
          start: currentStart,
          end: currentStart + currentChunk.length
        });
        id++;
        const overlapStart = Math.max(0, currentChunk.length - overlap);
        currentChunk = currentChunk.substring(overlapStart) + '\n\n' + paragraph;
        currentStart = currentStart + currentChunk.length - overlap - paragraph.length;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        id: `chunk_${id}`,
        text: currentChunk.trim(),
        start: currentStart,
        end: currentStart + currentChunk.length
      });
    }

    return chunks;
  }

  function findRelevantChunks(query, topK = TOP_K_CHUNKS) {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
    
    const scoredChunks = documentChunks.map((chunk, index) => {
      const chunkLower = chunk.text.toLowerCase();
      let score = 0;
      
      for (const word of queryWords) {
        const matches = (chunkLower.match(new RegExp(word, 'g')) || []).length;
        score += matches;
      }
      
      if (chunkLower.includes(queryLower)) {
        score += 10;
      }
      
      return { ...chunk, score, index };
    });
    
    scoredChunks.sort((a, b) => b.score - a.score);
    
    return scoredChunks.slice(0, topK).map(c => ({
      id: c.id,
      text: c.text,
      score: c.score,
      index: c.index + 1
    }));
  }

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
      const relevantChunks = findRelevantChunks(question, TOP_K_CHUNKS);
      
      const context = relevantChunks.map((chunk, i) => 
        `[${i + 1}] ${chunk.text}`
      ).join('\n\n---\n\n');
      
      const language = languageSelect.value;
      const langInstruction = language && language !== 'English' 
        ? `Please provide your entire response in ${language}.`
        : '';
      
      const systemPrompt = `You are a helpful assistant that answers questions based strictly on the provided document context.

Guidelines:
1. Base your answer ONLY on the information from the document context provided below
2. Provide specific citations using the format [1], [2], etc. referencing the relevant chunks
3. If the requested information is not in the document, clearly state: "I don't find this information in the provided document"
4. Be accurate and concise
5. ${langInstruction}
6. If you're uncertain, express that uncertainty

Document Context:
${context}

Question: ${question}`;

      const apiKey = GEMINI_API_KEY;
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: systemPrompt }]
          }],
          generationConfig: {
            temperature: TEMPERATURE,
            maxOutputTokens: MAX_TOKENS
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error?.message?.includes('API key')) {
          throw new Error('Invalid API key. Please check your Gemini API key.');
        }
        throw new Error(errorData.error?.message || 'API request failed');
      }

      const result = await response.json();
      const answer = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received';

      const citations = relevantChunks.map((chunk, i) => ({
        index: i + 1,
        quote: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : ''),
        fileId: chunk.id,
        pageNumber: 'Ref'
      }));

      displayAnswer(answer, citations);
      questionInput.value = '';
      askBtn.disabled = true;

    } catch (err) {
      showError(askError, err.message);
    } finally {
      setLoading(askBtn, false, 'Ask Question', '<i class="fas fa-paper-plane icon"></i>');
    }
  }

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
      <div class="detail-item"><strong>Chunks:</strong> ${info.numChunks}</div>
      <div class="detail-item"><strong>Status:</strong> Ready</div>
    `;
  }

  function enableQuestionInput() {
    questionInput.disabled = false;
    languageSelect.disabled = false;
    askInfo.classList.add('hidden');
  }

  const translations = {
    English: {
      askHeader: 'Ask a Question',
      askPlaceholder: 'Ask a question about your PDF...',
      askBtn: 'Ask Question',
      sourcesHeader: 'Sources & Citations',
    },
    Hindi: {
      askHeader: 'सवाल पूछें',
      askPlaceholder: 'अपने पीडीएफ के बारे में एक सवाल पूछें...',
      askBtn: 'सवाल पूछें',
      sourcesHeader: 'स्रोत और उद्धरण',
    },
    Marathi: {
      askHeader: 'प्रश्न विचारा',
      askPlaceholder: 'तुमच्या पीडीएफ बद्दल प्रश्न विचारा...',
      askBtn: 'प्रश्न विचारा',
      sourcesHeader: 'स्रोत आणि उद्धरण',
    },
    Gujarati: {
      askHeader: 'પ્રશ્ન પૂછો',
      askPlaceholder: 'તમારા પીડીએફ વિશે પ્રશ્ન પૂછો...',
      askBtn: 'પ્રશ્ન પૂછો',
      sourcesHeader: 'સ્ત્રોતો અને અવતરણો',
    },
    Tamil: {
      askHeader: 'கேள்வி கேளுங்கள்',
      askPlaceholder: 'உங்கள் PDF பற்றி ஒரு கேள்வி கேளுங்கள்...',
      askBtn: 'கேள்வி கேளுங்கள்',
      sourcesHeader: 'ஆதாரங்கள் மற்றும் மேற்கோள்கள்',
    },
    Telugu: {
      askHeader: 'ప్రశ్న అడగండి',
      askPlaceholder: 'మీ PDF గురించి ప్రశ్న అడగండి...',
      askBtn: 'ప్రశ్న అడగండి',
      sourcesHeader: 'మూలాలు మరియు అనులేఖనాలు',
    },
    Kannada: {
      askHeader: 'ಪ್ರಶ್ನೆ ಕೇಳಿ',
      askPlaceholder: 'ನಿಮ್ಮ PDF ಬಗ್ಗೆ ಪ್ರಶ್ನೆ ಕೇಳಿ...',
      askBtn: 'ಪ್ರಶ್ನೆ ಕೇಳಿ',
      sourcesHeader: 'ಮೂಲಗಳು ಮತ್ತು ಉಲ್ಲೇಖಗಳು',
    },
    Bengali: {
      askHeader: 'প্রশ্ন জিজ্ঞাসা করুন',
      askPlaceholder: 'আপনার পিডিএফ সম্পর্কে একটি প্রশ্ন জিজ্ঞাসা করুন...',
      askBtn: 'প্রশ্ন জিজ্ঞাসা করুন',
      sourcesHeader: 'উৎস এবং উদ্ধৃতি',
    },
    Punjabi: {
      askHeader: 'ਸਵਾਲ ਪੁੱਛੋ',
      askPlaceholder: 'ਆਪਣੀ ਪੀਡੀਐਫ ਬਾਰੇ ਸਵਾਲ ਪੁੱਛੋ...',
      askBtn: 'ਸਵਾਲ ਪੁੱਛੋ',
      sourcesHeader: 'ਸਰੋਤ ਅਤੇ ਹਵਾਲੇ',
    },
    Malayalam: {
      askHeader: 'ചോദ്യം ചോദിക്കുക',
      askPlaceholder: 'നിങ്ങളുടെ PDF-നെ കുറിച്ച് ഒരു ചോദ്യം ചോദിക്കുക...',
      askBtn: 'ചോദ്യം ചോദിക്കുക',
      sourcesHeader: 'ഉറവിടങ്ങളും ഉദ്ധരണികളും',
    },
  };

  languageSelect.addEventListener('change', () => {
    const lang = languageSelect.value;
    const t = translations[lang] || translations['English'];

    document.querySelector('.ask-question .ask-question-header .component-header').innerHTML = 
      `<img width="64" height="64" src="https://img.icons8.com/cute-clipart/64/ask-question.png" alt="ask-question" class="ask-question-header-icon"/> ${t.askHeader}`;
    questionInput.placeholder = t.askPlaceholder;
    askBtn.innerHTML = `<i class="fas fa-paper-plane icon"></i> ${t.askBtn}`;
    document.querySelector('#citations-section h3').textContent = t.sourcesHeader;
  });

  function displayAnswer(answer, citations) {
    answerContainer.classList.remove('hidden');
    answerText.textContent = answer;
    answerText.classList.remove('hidden');

    if (citations && citations.length > 0) {
      citationsSection.classList.remove('hidden');
      const lang = languageSelect.value;
      const sourceLabel =
        lang === 'Hindi' ? 'स्रोत'
        : lang === 'Marathi' ? 'स्रोत'
        : lang === 'Gujarati' ? 'સ્ત્રોત'
        : lang === 'Tamil' ? 'ஆதாரம்'
        : lang === 'Telugu' ? 'మూలం'
        : lang === 'Kannada' ? 'ಮೂಲ'
        : lang === 'Bengali' ? 'উৎস'
        : lang === 'Punjabi' ? 'ਸਰੋਤ'
        : lang === 'Malayalam' ? 'ഉറവിടം'
        : 'Source';

      const pageLabel =
        lang === 'Hindi' ? 'पृष्ठ'
        : lang === 'Marathi' ? 'पृष्ठ'
        : lang === 'Gujarati' ? 'પૃષ્ઠ'
        : lang === 'Tamil' ? 'பக்கம்'
        : lang === 'Telugu' ? 'పేజీ'
        : lang === 'Kannada' ? 'ಪುಟ'
        : lang === 'Bengali' ? 'পৃষ্ঠা'
        : lang === 'Punjabi' ? 'ਪੰਨਾ'
        : lang === 'Malayalam' ? 'പേജ്'
        : 'Page';

      citationsList.innerHTML = citations
        .map((c) => `
          <div class="citation-item">
            <div class="citation-header">
              <span class="citation-badge">${sourceLabel} ${c.index}</span>
              <span class="citation-page">${pageLabel} ${c.pageNumber}</span>
            </div>
            <div class="citation-text">"${c.quote}"</div>
          </div>
        `)
        .join('');
    } else {
      citationsSection.classList.add('hidden');
    }

    answerContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});
