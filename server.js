const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(express.json({limit: '50mb'}));

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

let storedTokens = null;

app.post('/ask', async (req, res) => {
  try {
    const { messages, system, apiKey } = req.body;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 200, system, messages })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message });
    res.json({ text: data.content[0].text.trim() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/speak', async (req, res) => {
  try {
    const { text, elevenLabsKey } = req.body;
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': elevenLabsKey },
      body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true } })
    });
    if (!response.ok) { const err = await response.json(); return res.status(response.status).json({ error: err.detail }); }
    const audioBuffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { tokens } = await oauth2Client.getToken(req.query.code);
  storedTokens = tokens;
  res.redirect(process.env.FRONTEND_URL + '?drive=connected');
});

app.post('/upload-session', async (req, res) => {
  if (!storedTokens) return res.status(401).json({ error: 'not_connected' });
  oauth2Client.setCredentials(storedTokens);
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const { transcript, audioBase64, mode, caseName } = req.body;
  const timestamp = new Date().toISOString().slice(0,19).replace(/[:.]/g,'-');

  const search = await drive.files.list({ q: "name='CrossFire Sessions' and mimeType='application/vnd.google-apps.folder' and trashed=false" });
  let folderId = search.data.files[0]?.id;
  if (!folderId) {
    const f = await drive.files.create({ requestBody: { name: 'CrossFire Sessions', mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
    folderId = f.data.id;
  }

  await drive.files.create({
    requestBody: { name: `${caseName}-${mode}-${timestamp}.txt`, parents: [folderId] },
    media: { mimeType: 'text/plain', body: Readable.from([transcript]) }
  });

  if (audioBase64) {
    const buf = Buffer.from(audioBase64, 'base64');
    await drive.files.create({
      requestBody: { name: `${caseName}-${mode}-${timestamp}.mp3`, parents: [folderId] },
      media: { mimeType: 'audio/mpeg', body: Readable.from([buf]) }
    });
  }

  res.json({ success: true });
});

app.listen(process.env.PORT || 3000, () => console.log('Server running'));
