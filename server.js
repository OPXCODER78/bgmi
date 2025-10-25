const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.post('/api/chat', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY on server' });
    }

    const { message, history = [], model = 'gemini-1.5-flash' } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const contents = [];
    for (const turn of history) {
      if (!turn || !turn.role || !turn.text) continue;
      const role = turn.role === 'assistant' || turn.role === 'model' ? 'model' : 'user';
      contents.push({
        role,
        parts: [{ text: String(turn.text).slice(0, 8000) }]
      });
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    const body = {
      contents,
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 2048
      }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const details = await response.text();
      return res.status(response.status).json({ error: 'Gemini API error', details });
    }

    const data = await response.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      '';

    return res.json({ text });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(499).json({ error: 'Request aborted' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
