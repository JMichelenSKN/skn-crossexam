const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({limit: '50mb'}));

app.post('/ask', async (req, res) => {
  try {
    const { messages, system, apiKey } = req.body;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 200,
        system: system,
        messages: messages
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message });
    res.json({ text: data.content[0].text.trim() });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT || 3000);
