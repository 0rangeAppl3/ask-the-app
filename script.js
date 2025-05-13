// --- Server-Side (Express - to run on Vercel's Node.js environment) ---
import express from 'express';
import { OpenAI } from 'openai';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post('/ask', async (req, res) => {
    console.log("--- /ask route hit (within script.js) ---");
    console.log("Request body:", req.body);
    try {
        const { question, tone, audiencePrompt } = req.body;
        if (!question || !tone || !audiencePrompt) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const systemPromptContent = `You are answering this question in Vietnamese like a ${tone} ${audiencePrompt}. Keep the answer simple and fun. Your response should be just the answer, without any preamble.`;

        const chatCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // Or your preferred chat model
            messages: [
                { role: 'system', content: systemPromptContent },
                { role: 'user', content: question }
            ],
            temperature: 0.7,
            max_tokens: 200
        });

        const answer = chatCompletion.choices[0]?.message?.content.trim();
        if (!answer) {
            return res.status(500).json({ error: "No answer from OpenAI" });
        }

        res.json({ answer });

    } catch (error) {
        console.error("Error in /ask (within script.js):", error);
        if (error instanceof OpenAI.APIError) {
            res.status(500).json({ error: `OpenAI API Error: ${error.message}` });
        } else {
            res.status(500).json({ error: "Error processing your request" });
        }
    }
});

app.post('/openai-tts', async (req, res) => {
    console.log("--- /openai-tts route hit (within script.js) ---");
    console.log("Request body:", req.body);
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Missing text for TTS' });
        }

        const mp3 = await openai.audio.speech.create({
            model: "tts-1",
            voice: "nova",
            input: text,
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());

        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(buffer);

    } catch (error) {
        console.error("Error in /openai-tts (within script.js):", error);
        if (error instanceof OpenAI.APIError) {
            res.status(500).json({ error: `OpenAI TTS Error: ${error.message}` });
        } else {
            res.status(500).json({ error: "Error generating speech" });
        }
    }
});

// --- Client-Side JavaScript ---
async function fetchAnswer() {
    const questionInput = document.getElementById('question');
    const toneSelect = document.getElementById('tone');
    const audienceSelect = document.getElementById('audience');
    const answerDiv = document.getElementById('answer');
    const speakButton = document.getElementById('speak-button');
    const question = questionInput.value.trim();
    const tone = toneSelect.value;
    const audiencePrompt = audienceSelect.value;

    if (!question) {
        alert('Please enter your question.');
        return;
    }

    answerDiv.textContent = 'Loading...';
    speakButton.disabled = true;

    try {
        const response = await fetch('/ask', { // Now calling the server on the same origin
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ question, tone, audiencePrompt }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error from /ask:', errorData);
            answerDiv.textContent = `Error: ${errorData.error || 'Something went wrong'}`;
            return;
        }

        const data = await response.json();
        const answer = data.answer;
        answerDiv.textContent = answer;
        speakButton.disabled = false;

    } catch (error) {
        console.error('Fetch error:', error);
        answerDiv.textContent = 'Failed to fetch answer.';
    }
}

function speakAnswer(text) {
    if (!window.speechSynthesis) {
        alert('Text-to-speech not supported in this browser.');
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    // Try to find a Vietnamese voice
    let vietnameseVoice = voices.find(voice => voice.lang.startsWith('vi'));
    if (vietnameseVoice) {
        utterance.voice = vietnameseVoice;
    } else if (voices.length > 0) {
        utterance.voice = voices[0]; // Fallback to the first available voice
    }

    // Optional settings
    // utterance.rate = 0.9;
    // utterance.pitch = 1;

    speechSynthesis.speak(utterance);
}

// Export the Express app for Vercel
export default app;