// script.js

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
let availableVoices = []; // Store loaded voices

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

    // Initialize voice list
    if (synthesis.getVoices().length === 0) {
        synthesis.onvoiceschanged = populateVoiceList;
    } else {
        populateVoiceList(); // Call directly if voices are already loaded
    }
});

function populateVoiceList() {
    availableVoices = synthesis.getVoices();
    console.log("Voices loaded/changed. Total voices:", availableVoices.length);
    if (availableVoices.length === 0 && synthesis.getVoices().length > 0) {
        // Sometimes onvoiceschanged fires but getVoices() inside it is empty the first time
        // Let's try to repopulate from the source if our array is empty but the API has them
        console.log("Retrying to populate voices as availableVoices was empty but synthesis.getVoices() has some.");
        availableVoices = synthesis.getVoices();
        console.log("Re-populated voices count:", availableVoices.length);
    }
    // You could add logic here if you need to speak something that was queued
    // For example, if an utterance was waiting for voices to load.
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
    recognition.lang = 'vi-VN';

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
        fetchAnswer(transcript); // statusText and spinner handled in fetchAnswer
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error, event);
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
        // Only reset if it wasn't due to a result being processed which calls fetchAnswer
        if (isListening && micButton.textContent === 'LISTENING...') {
             resetMicButton();
        }
    };
}

function toggleListen() {
    if (!recognition) return;

    // Cancel any ongoing speech synthesis before starting new recognition
    if (synthesis.speaking) {
        console.log("Cancelling speech synthesis before new recognition starts.");
        synthesis.cancel();
    }

    if (isListening) {
        recognition.stop();
        resetMicButton(); // Should ideally be handled by onend or onerror
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
    // Optionally clear status text or set to default if not an error
    if (!statusText.textContent.toLowerCase().includes('error')) {
        statusText.textContent = 'Tap the mic to ask a question.';
    }
}

async function fetchAnswer(question) {
    loadingSpinner.style.display = 'block';
    statusText.textContent = 'Thinking...';
    micButton.disabled = true; // Disable button while processing

    const currentTone = tones[currentToneIndex].toLowerCase();
    const currentAudienceForPrompt = audiencePromptMap[audienceLevels[currentAudienceIndex]];

    try {
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
            const errorData = await response.json();
            console.error('API Proxy Error:', response.status, errorData);
            throw new Error(`Failed to get answer: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        let answer = data.answer;

        if (!answer) {
            throw new Error("No answer received from proxy.");
        }

        answerDisplay.textContent = answer;
        speakAnswer(answer); // Call speakAnswer with the received answer

    } catch (error) {
        console.error('Error fetching answer via proxy:', error);
        answerDisplay.textContent = `Oops! Something went wrong. ${error.message}`;
        // Optionally speak the error too, or a generic error message
        speakAnswer(`Sorry, I encountered an error: ${error.message.split(':')[0]}.`);
    } finally {
        micButton.disabled = false; // Re-enable button
        resetMicButton(); // Resets text, spinner
        statusText.textContent = 'Tap to ask another question!'; // Set appropriate status
    }
}

async function speakAnswer(text) {
    if (!text) return;

    try {
        const response = await fetch('/openai-tts', { // Or the correct path to your proxy
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: text }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("OpenAI TTS Error:", errorData);
            // Fallback to browser TTS if you want
            const utterance = new SpeechSynthesisUtterance(text);
            speechSynthesis.speak(utterance);
            return;
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();

        // Clean up the URL object to release resources
        audio.addEventListener('ended', () => {
            URL.revokeObjectURL(audioUrl);
        });
        audio.addEventListener('error', (error) => {
            console.error("Error playing audio:", error);
            URL.revokeObjectURL(audioUrl);
        });

    } catch (error) {
        console.error("Error sending TTS request:", error);
        // Fallback to browser TTS if you want
        const utterance = new SpeechSynthesisUtterance(text);
        speechSynthesis.speak(utterance);
    }
}


// --- SWIPE CONTROLS ---
// (Keep your existing setupSwipeControls, handleSwipe, updateAudienceUI, updateToneUI functions here)
// Make sure they are unchanged unless specifically mentioned. For brevity, not re-pasting them.
// For example:
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
const swipeThreshold = 50;

function setupSwipeControls() {
    document.body.addEventListener('touchstart', (e) => {
        if (e.target === micButton || answerDisplay.contains(e.target) || e.target.closest('.mic-button') || e.target.closest('.answer-display') ) return;
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.body.addEventListener('touchend', (e) => {
        if (e.target === micButton || answerDisplay.contains(e.target) || e.target.closest('.mic-button') || e.target.closest('.answer-display')) return;
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
