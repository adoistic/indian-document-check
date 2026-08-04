import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import 'dotenv/config';

import { verifySubmission, VerificationError } from './verify.js';
import { FIELDS } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const MODEL = process.env.OPENROUTER_MODEL ?? 'google/gemini-3.1-flash-lite';

const app = express();

// Base64 images get large — an 8 MB body comfortably covers a 5 MB photo.
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor/pdfjs', express.static(path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build')));
app.use('/samples', express.static(path.join(__dirname, '..', 'samples')));

// The browser reuses the server's Verhoeff implementation rather than duplicating it.
app.get('/lib/aadhaar.js', (_req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'aadhaar.js'));
});

// Synthetic fixtures, if `npm run synth` has been run. Absent in a clean checkout.
app.get('/api/samples', async (_req, res) => {
  try {
    const manifest = JSON.parse(await readFile(path.join(__dirname, '..', 'samples', 'index.json'), 'utf8'));
    res.json(manifest.cases.map(({ id, expected_verdict, submission, image }) => ({
      id,
      expected_verdict,
      submission,
      image_url: `/samples/${image}`,
    })));
  } catch {
    res.status(404).json({ error: 'No synthetic samples generated yet. Run `npm run synth`.' });
  }
});

app.get('/api/config', (_req, res) => {
  res.json({
    model: MODEL,
    fields: FIELDS,
    api_key_configured: Boolean(process.env.OPENROUTER_API_KEY),
  });
});

app.post('/api/verify', async (req, res) => {
  const { image, ...rest } = req.body ?? {};
  const submission = Object.fromEntries(FIELDS.map(({ key }) => [key, rest[key] ?? null]));

  if (!submission.name || !submission.aadhaar_number) {
    return res.status(400).json({ error: 'Name and Aadhaar number are required.' });
  }

  // Abort the upstream call if the browser navigates away mid-request.
  const controller = new AbortController();
  req.on('aborted', () => controller.abort());

  try {
    const result = await verifySubmission(submission, image, { signal: controller.signal });
    res.json(result);
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (err instanceof VerificationError) {
      console.error(`[verify] ${err.message}`, err.detail ?? '');
      return res.status(err.status).json({ error: err.message, detail: err.detail });
    }
    console.error('[verify] unexpected error', err);
    res.status(500).json({ error: 'Unexpected server error.', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Aadhaar Form Verifier  →  http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL}`);
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('  ⚠  OPENROUTER_API_KEY is not set — copy .env.example to .env and add your key.\n');
  } else {
    console.log('');
  }
});
