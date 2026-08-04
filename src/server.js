// Local development server. Production runs the same handlers inside a
// Cloudflare Worker — see worker/index.js.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import 'dotenv/config';

import { DEFAULT_MODEL, routeApi } from './core/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT ?? 5285);

const config = {
  apiKey: process.env.OPENROUTER_API_KEY,
  model: process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
};

const app = express();

// Document photos arrive as base64, so the body limit has to be generous.
app.use(express.json({ limit: '14mb' }));
app.use(express.static(path.join(ROOT, 'public')));

app.all('/api/*splat', async (req, res) => {
  const controller = new AbortController();
  req.on('aborted', () => controller.abort());

  const result = await routeApi(req.path, req.method, req.body, config, controller.signal);
  if (!result) return res.status(404).json({ error: 'Not found.' });
  res.status(result.status).json(result.body);
});

app.listen(PORT, () => {
  console.log(`\n  Document Check  →  http://localhost:${PORT}`);
  if (!config.apiKey) console.warn('  ⚠  OPENROUTER_API_KEY is not set — copy .env.example to .env and add your key.\n');
  else console.log('');
});
