// api/openai-proxy.js
export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Only POST requests allowed' });
  }

  const { question, tone, audiencePrompt } = request.body;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return response.status(500).json({ error: 'API key not configured' });
  }
  if (!question || !tone || !audiencePrompt) {
    return response.status(400).json({ error: 'Missing required parameters: question, tone, audiencePrompt' });
  }

  const systemPromptContent = `You are answering this question like a ${tone} ${audiencePrompt}. Keep the answer simple and fun. Your response should be just the answer, without any preamble like "Okay, here's the answer..." or any conversational fluff.`;

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPromptContent },
          { role: 'user', content: question }
        ],
        temperature: 0.7,
        max_tokens: 150
      })
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      console.error('OpenAI API Error:', errorData);
      return response.status(openaiResponse.status).json({ error: `OpenAI API Error: ${errorData.error?.message || openaiResponse.statusText}` });
    }

    const data = await openaiResponse.json();
    const answer = data.choices[0]?.message?.content.trim();
    
    if (!answer) {
        return response.status(500).json({error: "No answer received from AI in proxy."})
    }
    return response.status(200).json({ answer });

  } catch (error) {
    console.error('Error in proxy function:', error);
    return response.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
}