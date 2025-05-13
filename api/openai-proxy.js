import OpenAI from 'openai';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const app = express(); // Using 'app' consistently
app.use(cors());
app.use(bodyParser.json());

// --- OpenAI Chat Completion ---
app.post('/api/openai-proxy/ask', async (req, res) => { // Full path for clarity
    console.log("--- /api/openai-proxy/ask route hit ---");
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
        console.error("Error in /ask:", error);
        // Improved error handling: Send more informative errors
        if (error instanceof OpenAI.APIError) {
            res.status(500).json({ error: `OpenAI API Error: ${error.message}` });
        } else {
            res.status(500).json({ error: "Error processing your request" });
        }
    }
});

// --- OpenAI Text-to-Speech ---
app.post('/api/openai-proxy/openai-tts', async (req, res) => { // Full path
    console.log("--- /api/openai-proxy/openai-tts route hit ---");
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
        console.error("Error in /openai-tts:", error);
        // Improved error handling
        if (error instanceof OpenAI.APIError) {
            res.status(500).json({ error: `OpenAI TTS Error: ${error.message}` });
        } else {
            res.status(500).json({ error: "Error generating speech" });
        }
    }
});

export default app; // Export the express app