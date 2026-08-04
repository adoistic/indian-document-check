// The two calls the app makes, written so they run unchanged on Node and on
// Cloudflare Workers: nothing here touches the filesystem or `process`.

import { getDocument, isCriticalField } from '../../public/lib/documents.js';
import { extractionPrompt, extractionSchema, verificationPrompt, verificationSchema } from './schema.js';
import { checkDate, checkNumber } from '../../public/lib/validators.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export class ReadError extends Error {
  constructor(message, status = 502, detail) {
    super(message);
    this.name = 'ReadError';
    this.status = status;
    this.detail = detail;
  }
}

/** Accepts a data URL or a bare base64 PNG; rejects anything that is not an image. */
function asImageUrl(image) {
  const value = String(image ?? '').trim();
  if (!value) throw new ReadError('No document was attached.', 400);

  if (value.startsWith('data:')) {
    const mime = value.slice(5, value.indexOf(';'));
    if (mime === 'application/pdf') {
      throw new ReadError('A PDF has to be turned into a picture before it can be read. The web page does this for you.', 400);
    }
    if (!mime.startsWith('image/')) throw new ReadError(`That file type (${mime}) cannot be read. Use a photo, a scan or a PDF.`, 400);
    return value;
  }
  return `data:image/png;base64,${value}`;
}

async function callModel({ system, user, image, schema, config, signal }) {
  const apiKey = config?.apiKey;
  if (!apiKey) throw new ReadError('This copy of the app has not been given a key yet, so it cannot read documents.', 500);

  const started = Date.now();
  let response;

  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/adoistic/indian-document-check',
        'X-Title': 'Document Check',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'text', text: user },
              { type: 'image_url', image_url: { url: asImageUrl(image) } },
            ],
          },
        ],
        response_format: { type: 'json_schema', json_schema: schema },
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ReadError('Could not reach the reading service. Check the connection and try again.', 502, err.message);
  }

  const raw = await response.text();

  if (!response.ok) {
    let detail = raw.slice(0, 500);
    try {
      detail = JSON.parse(raw)?.error?.message ?? detail;
    } catch {
      /* keep the raw text */
    }
    const message =
      response.status === 401
        ? 'The key this app is using was rejected.'
        : response.status === 429
          ? 'Too many documents at once. Wait a moment and try again.'
          : 'The reading service could not process this document.';
    throw new ReadError(message, response.status === 401 ? 401 : 502, detail);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new ReadError('Got an unreadable reply while reading the document.', 502, raw.slice(0, 500));
  }

  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  const textOut = Array.isArray(content)
    ? content.map((part) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('')
    : content;

  if (!textOut || !textOut.trim()) {
    throw new ReadError('Nothing came back for this document. Try a clearer photo.', 502, { finish_reason: choice?.finish_reason });
  }

  let parsed;
  try {
    parsed = JSON.parse(textOut);
  } catch {
    const fenced = textOut.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (!fenced) throw new ReadError('The reply about this document was malformed.', 502, textOut.slice(0, 500));
    parsed = JSON.parse(fenced[1]);
  }

  return { parsed, meta: { latency_ms: Date.now() - started, usage: payload.usage ?? null } };
}

// ── Local checks — no network, no model ───────────────────────────────────

/**
 * Everything we can tell on our own: number formats, checksums, sensible dates.
 * These run whatever the document says, so an impossible number is caught even
 * when the photo is unreadable.
 */
export function localChecks(docId, submission) {
  const doc = getDocument(docId);
  if (!doc) return [];

  const checks = [];

  for (const field of doc.fields) {
    const value = submission[field.key];
    if (!value || !String(value).trim()) continue;

    const numberCheck = checkNumber(field.key, value);
    if (numberCheck) {
      checks.push({ level: numberCheck.ok ? 'ok' : 'error', message: numberCheck.message });
      continue;
    }

    if (field.type === 'date') {
      const isBirth = field.key === 'date_of_birth';
      const dateCheck = checkDate(value, {
        label: isBirth ? 'date of birth' : field.label.toLowerCase(),
        mustBePast: isBirth,
      });
      if (dateCheck) checks.push({ level: dateCheck.ok ? 'ok' : 'error', message: dateCheck.message });
    }
  }

  return checks;
}

// ── Public API ────────────────────────────────────────────────────────────

/** Read a document and return the values printed on it, ready to drop into the form. */
export async function readDocument(docId, image, config, signal) {
  const doc = getDocument(docId);
  if (!doc) throw new ReadError(`Unknown document type "${docId}".`, 400);

  const { system, user } = extractionPrompt(docId);
  const { parsed, meta } = await callModel({ system, user, image, schema: extractionSchema(docId), config, signal });

  // Dates sometimes come back as DD/MM/YYYY despite the instruction; normalise
  // them so the browser's date inputs accept them.
  const extracted = { ...parsed.extracted };
  for (const field of doc.fields) {
    if (field.type === 'date') extracted[field.key] = normaliseDate(extracted[field.key]);
  }

  return { document: docId, document_assessment: parsed.document_assessment, extracted, meta };
}

/** Compare a filled-in form against the document. */
export async function checkDocument(docId, submission, image, config, signal) {
  const doc = getDocument(docId);
  if (!doc) throw new ReadError(`Unknown document type "${docId}".`, 400);

  const { system, user } = verificationPrompt(docId, submission);
  const { parsed, meta } = await callModel({ system, user, image, schema: verificationSchema(docId), config, signal });

  return {
    document: docId,
    ...parsed,
    field_results: reconcile(doc, parsed.field_results, submission),
    local_checks: localChecks(docId, submission),
    meta,
  };
}

/** Guarantee one row per field, in form order, even if the model skipped one. */
function reconcile(doc, results, submission) {
  const byField = new Map((results ?? []).map((r) => [r.field, r]));

  return doc.fields.map((field) => {
    const submitted = submission[field.key] ? String(submission[field.key]).trim() : null;
    const existing = byField.get(field.key);

    if (existing) {
      return {
        ...existing,
        label: field.label,
        important: isCriticalField(field.key),
        submitted_value: existing.submitted_value ?? submitted,
      };
    }

    return {
      field: field.key,
      label: field.label,
      important: isCriticalField(field.key),
      submitted_value: submitted,
      extracted_value: null,
      verdict: submitted ? 'not_found_on_document' : 'not_submitted',
      reason: 'This field was not reported on.',
    };
  });
}

/** Turn whatever date shape came back into YYYY-MM-DD, or leave it be. */
function normaliseDate(value) {
  if (!value) return null;
  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}$/.test(text)) return text; // year-only documents

  const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
}
