// --- CONFIGURATION ---
//  !!!  IMPORTANT:  Do NOT hardcode your OpenAI API key here.  !!!
//  It MUST be handled server-side for security.
const PROXY_URL = '/openai-tts'; //  Adjust if your server endpoint is different
const CHAT_PROXY_URL = '/ask';    //  Endpoint for chat completions

// --- STATE ---
const audienceLevels = ['For a 5-year-old', 'For a teenager', 'For an expert'];
const audiencePromptMap = {
    'For a 5-year-old': '5-year-old',
    'For a teenager': 'teenager',
    'For an expert': 'expert'
};
const tones = ['Playful', 'Serious', 'Sarcastic'];

let currentAudienceIndex = 1;
let currentToneIndex = 0;

let recognition;
let isListening = false;

// --- DOM ELEMENTS ---
const micButton = document.getElementById('micButton');
const statusText = document.getElementById('statusText');
const questionDisplay = document.getElementById('questionDisplay');
const answerDisplay = document.getElementById('answerDisplay');
const loadingSpinner = document.getElementById('loadingSpinner');
const audienceSelectorUI = document.getElementById('audienceSelector');
const toneSelectorUI = document.getElementById('toneSelector');

let currentAudio;  // To hold the currently playing audio

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    setupSpeechRecognition();
    setupSwipeControls();
    updateAudienceUI();
    updateToneUI();

    micButton.addEventListener('click', toggleListen);
});

function setupSpeechRecognition() {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!window.SpeechRecognition) {
        statusText.textContent = "Speech recognition not supported in this browser.";
        micButton.disabled = true;
        return;
    }
    recognition = new SpeechRecognition();
    recognition.interimResults = false;
    recognition.lang = 'vi-VN';  //  Vietnamese

    recognition.onstart = () => {
        isListening = true;
        micButton.textContent = 'LISTENING...';
        statusText.textContent = 'Listening...';
        questionDisplay.textContent = '';
        answerDisplay.textContent = '';
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        questionDisplay.textContent = `"${transcript}"`;
        statusText.textContent = 'Thinking...';
        loadingSpinner.style.display = 'block';
        fetchAnswer(transcript);
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        statusText.textContent = `Error: ${event.error}. Try again?`;
        if (event.error === 'no-speech') {
            statusText.textContent = "Didn't hear anything. Try again!";
        } else if (event.error === 'audio-capture') {
            statusText.textContent = "Microphone error. Check permissions.";
        } else if (event.error === 'not-allowed') {
            statusText.textContent = "Permission denied for microphone.";
        }
        resetMicButton();
    };

    recognition.onend = () => {
        if (isListening) {
            resetMicButton();
        }
    };
}

function toggleListen() {
    if (!recognition) return;
    if (isListening) {
        recognition.stop();
        resetMicButton();
    } else {
        try {
            recognition.start();
        } catch (e) {
            console.error("Error starting recognition:", e);
            statusText.textContent = "Could not start listening. Try again.";
            resetMicButton();
        }
    }
}

function resetMicButton() {
    isListening = false;
    micButton.textContent = 'TAP TO ASK';
    loadingSpinner.style.display = 'none';
}

async function fetchAnswer(question) {
    const currentTone = tones[currentToneIndex].toLowerCase();
    const currentAudience = audiencePromptMap[audienceLevels[currentAudienceIndex]];

    const systemPrompt = `You are answering this question in Vietnamese like a ${currentTone} ${currentAudience}. Keep the answer simple and fun. Your response should be just the answer, without any preamble like "Okay, here's the answer..." or any conversational fluff.`;

    try {
        const response = await fetch(CHAT_PROXY_URL, {  // Use CHAT_PROXY_URL
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: question,
                tone: currentTone,
                audiencePrompt: currentAudience,
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('OpenAI API Error:', errorData);
            throw new Error(`API Error: ${response.status} ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        let answer = data.answer;

        if (!answer) {
            throw new Error("No answer received from AI.");
        }

        answerDisplay.textContent = answer;
        speakAnswer(answer);

    } catch (error) {
        console.error('Error fetching answer:', error);
        answerDisplay.textContent = `Oops! Something went wrong. ${error.message}`;
        speakAnswer(`Oops! Something went wrong. ${error.message.split(':')[0]}`);
    } finally {
        resetMicButton();
        statusText.textContent = 'Tap to ask another question!';
    }
}

async function speakAnswer(text) {
    if (!text) return;

    try {
        const response = await fetch(PROXY_URL, {  // Use PROXY_URL for TTS
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: text }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("OpenAI TTS Error:", errorData);
            // Fallback to browser TTS (less ideal, but for robustness)
            const utterance = new SpeechSynthesisUtterance(text);
            speechSynthesis.speak(utterance);
            return;
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio.src = ''; //  Release previous audio
            currentAudio.remove();
        }
        currentAudio = new Audio(audioUrl);
        currentAudio.play();

        currentAudio.addEventListener('ended', () => {
            URL.revokeObjectURL(audioUrl); // Clean up
        });
        currentAudio.addEventListener('error', (error) => {
            console.error("Error playing audio:", error);
            URL.revokeObjectURL(audioUrl);
        });

    } catch (error) {
        console.error("Error sending TTS request:", error);
        // Fallback to browser TTS
        const utterance = new SpeechSynthesisUtterance(text);
        speechSynthesis.speak(utterance);
    }
}

// --- SWIPE CONTROLS ---
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
const swipeThreshold = 50;

function setupSwipeControls() {
    document.body.addEventListener('touchstart', (e) => {
        if (e.target === micButton || answerDisplay.contains(e.target)) return;
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.body.addEventListener('touchend', (e) => {
        if (e.target === micButton || answerDisplay.contains(e.target)) return;
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });
}

function handleSwipe() {
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (Math.abs(deltaX) > swipeThreshold) {
            if (deltaX > 0) {
                currentAudienceIndex = (currentAudienceIndex + 1) % audienceLevels.length;
            } else {
                currentAudienceIndex = (currentAudienceIndex - 1 + audienceLevels.length) % audienceLevels.length;
            }
            updateAudienceUI();
        }
    } else {
        if (Math.abs(deltaY) > swipeThreshold) {
            if (deltaY < 0) {
                currentToneIndex = (currentToneIndex + 1) % tones.length;
            } else {
                currentToneIndex = (currentToneIndex - 1 + tones.length) % tones.length;
            }
            updateToneUI();
        }
    }
    touchStartX = 0; touchStartY = 0; touchEndX = 0; touchEndY = 0;
}

// --- UI UPDATES ---
function updateAudienceUI() {
    audienceSelectorUI.innerHTML = audienceLevels.map((level, index) =>
        `<span class="option ${index === currentAudienceIndex ? 'active' : ''}">${level.replace("For a ", "").replace("For an ", "")}</span>`
    ).join(' | ');
}

function updateToneUI() {
    toneSelectorUI.innerHTML = tones.map((tone, index) =>
        `<span class="option ${index === currentToneIndex ? 'active' : ''}">${tone}</span>`
    ).join(' | ');
}