import OpenAI from 'openai';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';

const app = express();
app.get('/test', (req, res) => {
  console.log("Test route hit!");  //  Will this log?
  res.status(200).send("Hello from Vercel!");
});
export default app;  //  For Express

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const port = 3000;  // Or your preferred port

app.use(cors());
app.use(bodyParser.json());

//  ---  OpenAI Chat Completion  ---
app.post('/ask', async (req, res) => {
    try {
        const { question, tone, audiencePrompt } = req.body;
        if (!question || !tone || !audiencePrompt) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const systemPromptContent = `You are answering this question in Vietnamese like a ${tone} ${audiencePrompt}. Keep the answer simple and fun. Your response should be just the answer, without any preamble.`;

        const chatCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',  //  Or your preferred chat model
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
        console.error("Chat Completion Error:", error);
        res.status(500).json({ error: "Error processing your request" });
    }
});

//  ---  OpenAI Text-to-Speech  ---
app.post('/openai-tts', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Missing text in request body' });
        }

        const mp3 = await openai.audio.speech.create({
            model: "tts-1",
            voice: "nova",  //  Or another voice (e.g., "alloy", "echo", "fable", "onyx", "shimmer")
            input: text,
        });

        const buffer = await mp3.arrayBuffer();
        const audioBuffer = Buffer.from(buffer);

        res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length
        });
        res.end(audioBuffer);

    } catch (error) {
        console.error("TTS API Error:", error);
        res.status(500).json({ error: "Error generating speech" });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});