// Configuration
const GROQ_API_KEY = "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";
        
// DOM Elements
const textarea = document.getElementById('userInput');
const sendStopBtn = document.getElementById('sendStopBtn');
const buttonIcon = document.getElementById('buttonIcon');
const chatDisplay = document.getElementById('chatDisplay');
const logoSection = document.getElementById('logoSection');
const chatContainer = document.getElementById('chatContainer');
        
// State
let isGenerating = false;
let typingTimer = null;
let currentAIMessageDiv = null;
let currentAIWrapper = null;
let abortController = null;
let lastUserMessage = '';

// Configure marked for better code rendering
marked.setOptions({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { language: lang }).value;
            } catch (err) {
                console.error(err);
            }
        }
        // Auto-detect language if not specified
        try {
            return hljs.highlightAuto(code).value;
        } catch (err) {
            return code;
        }
    },
    breaks: true,
    gfm: true
});

// Auto-scroll to bottom
function scrollToBottom(smooth = true) {
    setTimeout(() => {
        chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
        });
    }, 50);
}

// Auto-resize textarea
function resizeTextarea() {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    updateSendButton();
}

// Update send button state
function updateSendButton() {
    if (isGenerating) {
        sendStopBtn.classList.add('stop');
        buttonIcon.className = 'fa-solid fa-stop';
    } else {
        sendStopBtn.classList.remove('stop');
        if (textarea.value.trim().length > 0) {
            sendStopBtn.classList.add('active');
            buttonIcon.className = 'fa-solid fa-arrow-up';
        } else {
            sendStopBtn.classList.remove('active');
            buttonIcon.className = 'fa-solid fa-arrow-up';
        }
    }
}

// Stop generation
function stopGeneration() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
    }
    isGenerating = false;
    currentAIMessageDiv = null;
    updateSendButton();
}

// Format text with markdown
function formatText(text) {
    try {
        // Configure marked for better code rendering
        const renderer = new marked.Renderer();
        
        // Customize code block rendering
        renderer.code = function(code, language) {
            // Generate unique ID for this code block
            const codeId = 'code-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            
            // Highlight the code
            let highlighted;
            if (language && hljs.getLanguage(language)) {
                highlighted = hljs.highlight(code, { language: language }).value;
            } else {
                highlighted = hljs.highlightAuto(code).value;
            }
            
            // Return HTML with copy button
            return `
                <div class="code-header">
                    <span>${language || 'code'}</span>
                    <button class="copy-code-btn" onclick="copyCodeBlock('${codeId}')">
                        <i class="fa-regular fa-copy"></i> Copy
                    </button>
                </div>
                <pre><code class="hljs language-${language || 'plaintext'}" id="${codeId}">${highlighted}</code></pre>
            `;
        };
        
        marked.use({ renderer });
        
        // Parse markdown
        return marked.parse(text);
    } catch (err) {
        console.error('Markdown parsing error:', err);
        return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }
}

// Copy code block function (will be attached to window)
window.copyCodeBlock = function(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        // Get raw text content (without HTML tags)
        const text = element.textContent || element.innerText;
        navigator.clipboard.writeText(text).then(() => {
            // Show feedback
            const btn = document.querySelector(`[onclick="copyCodeBlock('${elementId}')"]`);
            if (btn) {
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<i class="fa-regular fa-check"></i> Copied!';
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                }, 2000);
            }
        }).catch(err => {
            console.error('Copy failed:', err);
        });
    }
};

// Copy to clipboard
async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        // Simple feedback
        const originalText = textarea.value;
        textarea.value = '✓ Copied!';
        textarea.style.height = 'auto';
        setTimeout(() => {
            textarea.value = originalText;
            resizeTextarea();
        }, 1000);
    } catch (err) {
        console.error('Copy failed:', err);
    }
}

// Edit user message
function editMessage(text) {
    textarea.value = text;
    resizeTextarea();
    textarea.focus();
    scrollToBottom();
}

// Regenerate response
function regenerateResponse(userText) {
    if (isGenerating) return;
    textarea.value = userText;
    resizeTextarea();
    sendMessage(true);
}

// Add user message
function addUserMessage(text) {
    const group = document.createElement('div');
    group.className = 'message-group user-group';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble user-bubble';
    bubble.innerText = text;
    group.appendChild(bubble);
    
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    
    const editBtn = document.createElement('span');
    editBtn.className = 'action-btn';
    editBtn.innerHTML = '<i class="fa-regular fa-pen-to-square"></i>';
    editBtn.onclick = () => editMessage(text);
    
    actions.appendChild(editBtn);
    group.appendChild(actions);
    
    chatDisplay.appendChild(group);
    scrollToBottom();
    
    // Hide logo
    logoSection.style.display = 'none';
    
    return group;
}

// Add AI message (empty)
function addAIMessage() {
    const group = document.createElement('div');
    group.className = 'message-group ai-group';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble ai-bubble';
    bubble.innerHTML = '';
    group.appendChild(bubble);
    
    chatDisplay.appendChild(group);
    scrollToBottom();
    
    return { group, bubble };
}

// Add AI actions
function addAIActions(group, text) {
    // Remove old actions if any
    const oldActions = group.querySelector('.message-actions');
    if (oldActions) oldActions.remove();
    
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    
    // Copy button
    const copyBtn = document.createElement('span');
    copyBtn.className = 'action-btn';
    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
    copyBtn.onclick = () => copyText(text);
    
    // Regenerate button
    const regenBtn = document.createElement('span');
    regenBtn.className = 'action-btn';
    regenBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
    regenBtn.onclick = () => regenerateResponse(lastUserMessage);
    
    actions.appendChild(copyBtn);
    actions.appendChild(regenBtn);
    group.appendChild(actions);
}

// Typing effect with markdown
async function typeWriter(element, text, speed = 8) {
    return new Promise((resolve) => {
        let i = 0;
        element.innerHTML = '';
        isGenerating = true;
        currentAIMessageDiv = element;
        updateSendButton();
        
        // For markdown, we need to build the text gradually
        let accumulatedText = '';
        
        function type() {
            if (i < text.length) {
                accumulatedText += text.charAt(i);
                // Parse markdown and set HTML
                element.innerHTML = formatText(accumulatedText);
                i++;
                scrollToBottom(false);
                typingTimer = setTimeout(type, speed);
            } else {
                // Final formatting
                element.innerHTML = formatText(text);
                isGenerating = false;
                currentAIMessageDiv = null;
                clearTimeout(typingTimer);
                updateSendButton();
                resolve();
            }
        }
        
        type();
    });
}

// Show thinking indicator
function showThinking(group) {
    const thinking = document.createElement('div');
    thinking.className = 'thinking-dots';
    thinking.innerHTML = '<span></span><span></span><span></span>';
    group.querySelector('.message-bubble').innerHTML = '';
    group.querySelector('.message-bubble').appendChild(thinking);
    scrollToBottom();
}

// Main send function
async function sendMessage(isRegenerate = false) {
    const text = textarea.value.trim();
    if (!text || (isGenerating && !isRegenerate)) return;

    if (isGenerating) {
        // If generating, stop button should stop generation
        if (sendStopBtn.classList.contains('stop')) {
            stopGeneration();
        }
        return;
    }

    lastUserMessage = text;

    // Add user message if not regenerating
    if (!isRegenerate) {
        addUserMessage(text);
    }

    // Clear input
    textarea.value = '';
    resizeTextarea();

    // Add AI message with thinking
    const { group, bubble } = addAIMessage();
    showThinking(group);

    // Setup abort controller
    abortController = new AbortController();

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: text }]
            }),
            signal: abortController.signal
        });

        const data = await response.json();
        
        // Remove thinking indicator
        bubble.innerHTML = '';
        
        if (data.choices && data.choices[0]) {
            const reply = data.choices[0].message.content;
            
            // Typewriter effect with markdown
            await typeWriter(bubble, reply, 8);
            
            // Add actions after typing
            addAIActions(group, reply);
            
        } else {
            bubble.innerHTML = 'Error: Could not get response';
        }
        
    } catch (error) {
        bubble.innerHTML = error.name === 'AbortError' 
            ? '⏸️ Generation stopped' 
            : 'Error: Network issue';
        console.error(error);
    } finally {
        abortController = null;
        if (isGenerating) {
            isGenerating = false;
            updateSendButton();
        }
    }
}

// Reset chat
function resetChat() {
    if (isGenerating) {
        stopGeneration();
    }
    chatDisplay.innerHTML = '';
    logoSection.style.display = 'flex';
    textarea.value = '';
    resizeTextarea();
}

// Event listeners
textarea.addEventListener('input', resizeTextarea);

textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendStopBtn.addEventListener('click', () => sendMessage());

document.getElementById('newChatBtn').addEventListener('click', resetChat);
document.getElementById('newChatAlt').addEventListener('click', resetChat);

// Pill toggles
document.getElementById('thinkPill').addEventListener('click', function() {
    this.classList.toggle('active');
});
document.getElementById('searchPill').addEventListener('click', function() {
    this.classList.toggle('active');
});

// Initialize
resizeTextarea();
scrollToBottom();
