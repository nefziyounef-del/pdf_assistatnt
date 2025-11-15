let pdfText = '';
const pdfUpload = document.getElementById('pdfUpload');
const pdfStatus = document.getElementById('pdfStatus');
const questionInput = document.getElementById('questionInput');
const askBtn = document.getElementById('askBtn');
const answerOutput = document.getElementById('answerOutput');

// Configuration - REPLACE WITH YOUR ACTUAL API KEY
const OPENAI_API_KEY = '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';

pdfUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        pdfStatus.textContent = 'Loading PDF...';
        pdfStatus.style.color = '#ffba08';
        
        const fileReader = new FileReader();
        fileReader.onload = function() {
            const typedarray = new Uint8Array(this.result);
            
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
            
            pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
                let pagesPromises = [];
                for (let i = 1; i <= pdf.numPages; i++) {
                    pagesPromises.push(pdf.getPage(i).then(page => page.getTextContent()));
                }
                return Promise.all(pagesPromises);
            }).then(pages => {
                pdfText = '';
                pages.forEach(page => {
                    page.items.forEach(item => {
                        pdfText += item.str + ' ';
                    });
                });
                
                pdfText = pdfText.replace(/\s+/g, ' ').trim();
                pdfStatus.textContent = `PDF loaded successfully! (${pages.length} pages, ${pdfText.length} characters)`;
                pdfStatus.style.color = '#90ee90';
                
                // Auto-analyze content for common topics
                analyzeContent();
                
            }).catch(err => {
                pdfStatus.textContent = 'Error loading PDF: ' + err.message;
                pdfStatus.style.color = '#ff6b6b';
            });
        };
        fileReader.readAsArrayBuffer(file);
    } else {
        pdfStatus.textContent = 'Please upload a valid PDF.';
        pdfStatus.style.color = '#ff6b6b';
    }
});

// Auto-analyze PDF content to understand what's in it
function analyzeContent() {
    const commonTopics = {
        'introduction': ['introduction', 'overview', 'background'],
        'objectives': ['objective', 'goal', 'purpose', 'aim'],
        'methodology': ['method', 'approach', 'technique', 'procedure'],
        'results': ['result', 'finding', 'outcome', 'conclusion'],
        'discussion': ['discussion', 'analysis', 'interpretation'],
        'references': ['reference', 'bibliography', 'citation']
    };
    
    let detectedTopics = [];
    
    for (const [topic, keywords] of Object.entries(commonTopics)) {
        for (const keyword of keywords) {
            if (pdfText.toLowerCase().includes(keyword)) {
                detectedTopics.push(topic);
                break;
            }
        }
    }
    
    console.log('Detected topics:', detectedTopics);
}

askBtn.addEventListener('click', async function() {
    const question = questionInput.value.trim();
    
    if (!pdfText) {
        answerOutput.textContent = 'Please upload a PDF first.';
        return;
    }
    if (!question) {
        answerOutput.textContent = 'Please type a question.';
        return;
    }

    askBtn.disabled = true;
    askBtn.textContent = 'Thinking...';
    answerOutput.textContent = 'Analyzing PDF content...';

    try {
        let answer;
        
        if (OPENAI_API_KEY && OPENAI_API_KEY !== 'your-openai-api-key-here') {
            try {
                answer = await getAIAnswer(question, pdfText);
                answerOutput.innerHTML = `<strong>AI Answer:</strong><br>${answer}`;
            } catch (aiError) {
                console.warn('AI failed, using smart search:', aiError);
                answer = getSmartAnswer(question);
                answerOutput.innerHTML = `<strong>Smart Answer:</strong><br>${answer}<br><br><em>Note: Using enhanced search</em>`;
            }
        } else {
            answer = getSmartAnswer(question);
            answerOutput.innerHTML = `<strong>Smart Answer:</strong><br>${answer}`;
        }
        
    } catch (error) {
        console.error('Error:', error);
        answerOutput.textContent = 'Error: ' + error.message;
    } finally {
        askBtn.disabled = false;
        askBtn.textContent = 'Ask';
    }
});

async function getAIAnswer(question, context) {
    const maxContextLength = 10000;
    const truncatedContext = context.length > maxContextLength 
        ? context.substring(0, maxContextLength) + '... [content truncated]'
        : context;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that answers questions based ONLY on the provided document content. If the answer cannot be found in the text, say "I cannot find this information in the document." Keep answers concise and accurate.'
                },
                {
                    role: 'user',
                    content: `Document Content: ${truncatedContext}\n\nQuestion: ${question}\n\nAnswer based on the document:`
                }
            ],
            max_tokens: 500,
            temperature: 0.1
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
}

// IMPROVED SMART SEARCH - Better for short questions
function getSmartAnswer(question) {
    const sentences = pdfText.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const questionLower = question.toLowerCase().trim();
    
    // Handle common short questions
    const questionMap = {
        'what is include': ['include', 'contains', 'consist', 'comprise', 'content', 'element'],
        'what include': ['include', 'contains', 'consist', 'comprise', 'content', 'element'],
        'summary': ['summary', 'conclusion', 'overview', 'key point', 'main'],
        'what is this about': ['introduction', 'purpose', 'objective', 'aim', 'study', 'research'],
        'main topic': ['topic', 'subject', 'theme', 'focus', 'discuss']
    };
    
    // Expand short questions to related keywords
    let searchKeywords = [];
    
    // Check if question matches any common patterns
    for (const [pattern, keywords] of Object.entries(questionMap)) {
        if (questionLower.includes(pattern) || pattern.includes(questionLower)) {
            searchKeywords = [...keywords];
            break;
        }
    }
    
    // If no pattern matched, use the question words
    if (searchKeywords.length === 0) {
        searchKeywords = questionLower.split(' ')
            .filter(word => word.length > 2 && !['what', 'when', 'where', 'which', 'who', 'how', 'why', 'does', 'do', 'is', 'are', 'the', 'and', 'for', 'about'].includes(word));
        
        // If still no good keywords, use broader search
        if (searchKeywords.length === 0) {
            searchKeywords = ['content', 'include', 'topic', 'discuss', 'describe'];
        }
    }
    
    console.log('Searching for keywords:', searchKeywords);
    
    let bestMatches = [];
    let exactMatches = [];
    
    sentences.forEach(sentence => {
        const sentenceLower = sentence.toLowerCase();
        let relevanceScore = 0;
        let matchedWords = [];
        
        // Check for exact phrase match
        if (sentenceLower.includes(questionLower) && questionLower.length > 3) {
            exactMatches.push(sentence);
        }
        
        // Score based on keyword matches
        searchKeywords.forEach(keyword => {
            if (sentenceLower.includes(keyword)) {
                relevanceScore += 5; // Higher base score
                matchedWords.push(keyword);
                
                // Bonus for multiple occurrences
                const occurrences = (sentenceLower.match(new RegExp(keyword, 'g')) || []).length;
                relevanceScore += occurrences * 2;
                
                // Bonus for important position (beginning of sentence)
                const firstWords = sentenceLower.split(' ').slice(0, 5).join(' ');
                if (firstWords.includes(keyword)) {
                    relevanceScore += 3;
                }
            }
        });
        
        // Bonus for longer sentences (likely more informative)
        if (sentence.length > 50) {
            relevanceScore += 2;
        }
        
        if (relevanceScore > 0) {
            bestMatches.push({
                sentence: sentence.trim(),
                score: relevanceScore,
                matchedWords: matchedWords
            });
        }
    });
    
    // If we have exact matches, use those first
    if (exactMatches.length > 0) {
        return exactMatches.slice(0, 2).join(' ');
    }
    
    // Sort by relevance score
    bestMatches.sort((a, b) => b.score - a.score);
    
    if (bestMatches.length === 0) {
        // If no matches found, return the beginning of the document
        const fallbackText = pdfText.substring(0, 300) + (pdfText.length > 300 ? '...' : '');
        return `I searched for information about "${question}" but didn't find exact matches. Here's the beginning of the document:\n\n${fallbackText}\n\nTry asking about specific topics like: "what is the main topic", "summary", or "key points".`;
    }
    
    // Return top 3 most relevant sentences
    const topMatches = bestMatches.slice(0, 3);
    let answer = '';
    
    topMatches.forEach((match, index) => {
        answer += match.sentence;
        if (!match.sentence.endsWith('.') && !match.sentence.endsWith('!') && !match.sentence.endsWith('?')) {
            answer += '.';
        }
        if (index < topMatches.length - 1) {
            answer += ' ';
        }
    });
    
    return answer;
}

// Allow pressing Enter to ask question
questionInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        askBtn.click();
    }
});

// Add some example questions for user guidance
function showExamples() {
    const examples = [
        "What is the main topic?",
        "Summary of the document",
        "Key points included",
        "What does this document discuss?",
        "Main objectives"
    ];
    
    console.log('Example questions:', examples);
}