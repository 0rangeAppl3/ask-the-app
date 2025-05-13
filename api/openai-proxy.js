import OpenAI from 'openai';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

// Existing /ask endpoint (keep this)
app.post('/ask', async (req, res) => {
    // ... your existing /ask logic ...
});

// New /openai-tts endpoint
app.post('/openai-tts', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Missing text in request body' });
        }

        const mp3 = await openai.audio.speech.create({
            model: "tts-1",
            voice: "nova", // You can change the voice (alloy, echo, fable, onyx, nova, shimmer)
            input: text,
        });

        // The response is a ReadableStream of the audio data
        const buffer = await mp3.arrayBuffer();
        const audioBuffer = Buffer.from(buffer);

        res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length
        });
        res.end(audioBuffer);

    } catch (error) {
        console.error("OpenAI TTS API Error:", error);
        res.status(500).json({ error: 'Failed to generate speech from OpenAI' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});