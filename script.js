// --- CONFIGURATION ---

// --- STATE ---
const audienceLevels = ['For a 5-year-old', 'For a teenager', 'For an expert'];
const audiencePromptMap = {
    'For a 5-year-old': '5-year-old',
    'For a teenager': 'teenager',
    'For an expert': 'expert'
};
const tones = ['Playful', 'Serious', 'Sarcastic'];

let currentAudienceIndex = 1; // Default: Teenager
let currentToneIndex = 0;     // Default: Playful

let recognition;
let synthesis = window.speechSynthesis;
let isListening = false;

// --- DOM ELEMENTS ---
const micButton = document.getElementById('micButton');
const statusText = document.getElementById('statusText');
const questionDisplay = document.getElementById('questionDisplay');
const answerDisplay = document.getElementById('answerDisplay');
const loadingSpinner = document.getElementById('loadingSpinner');
const audienceSelectorUI = document.getElementById('audienceSelector');
const toneSelectorUI = document.getElementById('toneSelector');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {

    setupSpeechRecognition();
    setupSwipeControls();
    updateAudienceUI();
    updateToneUI();

    micButton.addEventListener('click', toggleListen);

    // Pre-load voices
    if (synthesis.getVoices().length === 0) {
        synthesis.onvoiceschanged = populateVoiceList;
    } else {
        populateVoiceList();
    }
});

function populateVoiceList() {
    // console.log("Voices loaded:", synthesis.getVoices());
    // Can be used to select specific voices if needed
}

function setupSpeechRecognition() {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!window.SpeechRecognition) {
        statusText.textContent = "Speech recognition not supported in this browser.";
        micButton.disabled = true;
        return;
    }
    recognition = new SpeechRecognition();
    recognition.interimResults = false;
    recognition.lang = 'en-US';

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
        if (isListening) { // If it ended naturally without a result processed
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
    const currentAudienceForPrompt = audiencePromptMap[audienceLevels[currentAudienceIndex]];

    loadingSpinner.style.display = 'block'; // Show spinner earlier
    statusText.textContent = 'Thinking...';

    try {
        // Call your Vercel serverless function
        const response = await fetch('/api/openai-proxy', { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question: question,
                tone: currentTone,
                audiencePrompt: currentAudienceForPrompt
            })
        });

        if (!response.ok) {
            const errorData = await response.json(); // Try to get error message from proxy
            console.error('API Proxy Error:', response.status, errorData);
            throw new Error(`Failed to get answer: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        let answer = data.answer; 

        if (!answer) {
            throw new Error("No answer received from proxy.");
        }

        answerDisplay.textContent = answer;
        speakAnswer(answer);

    } catch (error) {
        console.error('Error fetching answer via proxy:', error);
        answerDisplay.textContent = `Oops! Something went wrong. ${error.message}`;
        speakAnswer(`Oops! Something went wrong. ${error.message.split(':')[0]}`);
    } finally {
        resetMicButton(); // Ensure button resets and spinner hides
        loadingSpinner.style.display = 'none';
        statusText.textContent = 'Tap to ask another question!';
    }
}

function speakAnswer(text) {
    if (!synthesis || !text) return;
    // Stop any ongoing speech
    synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    // You can try to select voices based on tone here, but it's complex
    // and voice availability varies greatly by browser/OS.
    // For simplicity, using default or first available English voice.
    const voices = synthesis.getVoices();
    let selectedVoice = voices.find(voice => voice.lang.startsWith('en') && voice.name.includes('Google') && !voice.name.includes('Male')); // Prefer a female Google voice
    if (!selectedVoice) {
         selectedVoice = voices.find(voice => voice.lang.startsWith('en') && voice.localService); // Try local
    }
    if (!selectedVoice) {
         selectedVoice = voices.find(voice => voice.lang.startsWith('en')); // Any English
    }
    if(selectedVoice) utterance.voice = selectedVoice;

    // Simple pitch/rate changes (optional, can be too much)
    // if (tones[currentToneIndex] === 'Playful') {
    //     utterance.pitch = 1.2; utterance.rate = 1.1;
    // } else if (tones[currentToneIndex] === 'Sarcastic') {
    //     utterance.pitch = 0.8; utterance.rate = 0.9;
    // }


    synthesis.speak(utterance);
}

// --- SWIPE CONTROLS ---
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
const swipeThreshold = 50; // Minimum distance for a swipe

function setupSwipeControls() {
    document.body.addEventListener('touchstart', (e) => {
        // Prevent swipe if touching the button or text areas to allow scrolling in answer
        if (e.target === micButton || answerDisplay.contains(e.target)) return;
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true }); // passive true if not calling preventDefault

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

    if (Math.abs(deltaX) > Math.abs(deltaY)) { // Horizontal swipe
        if (Math.abs(deltaX) > swipeThreshold) {
            if (deltaX > 0) { // Swipe Right
                currentAudienceIndex = (currentAudienceIndex + 1) % audienceLevels.length;
            } else { // Swipe Left
                currentAudienceIndex = (currentAudienceIndex - 1 + audienceLevels.length) % audienceLevels.length;
            }
            updateAudienceUI();
            // Optional: If an answer is displayed, you could re-fetch it.
            // For simplicity, changes apply to the next question.
            // if (answerDisplay.textContent) fetchAnswer(questionDisplay.textContent.slice(1,-1));
        }
    } else { // Vertical swipe
        if (Math.abs(deltaY) > swipeThreshold) {
            if (deltaY < 0) { // Swipe Up
                currentToneIndex = (currentToneIndex + 1) % tones.length;
            } else { // Swipe Down
                currentToneIndex = (currentToneIndex - 1 + tones.length) % tones.length;
            }
            updateToneUI();
             // if (answerDisplay.textContent) fetchAnswer(questionDisplay.textContent.slice(1,-1));
        }
    }
    // Reset touch coordinates
    touchStartX = 0; touchStartY = 0; touchEndX = 0; touchEndY = 0;
}

// --- UI UPDATES ---
function updateAudienceUI() {
    audienceSelectorUI.innerHTML = audienceLevels.map((level, index) => 
        `<span class="option ${index === currentAudienceIndex ? 'active' : ''}">${level.replace("For a ", "").replace("For an ", "")}</span>`
    ).join(' | ');
    // console.log("Audience:", audienceLevels[currentAudienceIndex]);
}

function updateToneUI() {
    toneSelectorUI.innerHTML = tones.map((tone, index) => 
        `<span class="option ${index === currentToneIndex ? 'active' : ''}">${tone}</span>`
    ).join(' | ');
    // console.log("Tone:", tones[currentToneIndex]);
}