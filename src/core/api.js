// The API, written once and used by both runtimes: Express locally, a
// Cloudflare Worker in production. Handlers take a plain object and return
// `{ status, body }`, so neither runtime's types leak in here.

import { documentSummaries, getDocument } from '../../public/lib/documents.js';
import { checkDocument, readDocument, ReadError } from './verify.js';
import { sortPile } from './pile.js';

export const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite';

/** Pulls the fields this document actually has out of an arbitrary request body. */
function submissionFor(doc, body) {
  return Object.fromEntries(doc.fields.map((f) => [f.key, body[f.key] ?? null]));
}

function fail(err) {
  if (err instanceof ReadError) {
    return { status: err.status, body: { error: err.message, detail: err.detail } };
  }
  console.error('[api] unexpected', err);
  return { status: 500, body: { error: 'Something went wrong at our end. Try again.' } };
}

export const handlers = {
  /** What the page needs on load. Deliberately says nothing about who does the reading. */
  config(config) {
    return { status: 200, body: { ready: Boolean(config.apiKey), documents: documentSummaries() } };
  },

  documents() {
    return { status: 200, body: { documents: documentSummaries() } };
  },

  async read(body, config, signal) {
    const doc = getDocument(body?.document);
    if (!doc) return { status: 400, body: { error: 'Pick which document this is first.' } };
    if (!body?.image) return { status: 400, body: { error: 'Attach the document first.' } };

    try {
      return { status: 200, body: await readDocument(doc.id, body.image, config, signal) };
    } catch (err) {
      return fail(err);
    }
  },

  async check(body, config, signal) {
    const doc = getDocument(body?.document);
    if (!doc) return { status: 400, body: { error: 'Pick which document this is first.' } };
    if (!body?.image) return { status: 400, body: { error: 'Attach the document first.' } };

    const submission = submissionFor(doc, body);
    const missing = doc.fields.filter((f) => f.required && !String(submission[f.key] ?? '').trim());
    if (missing.length) {
      return { status: 400, body: { error: `Still needed: ${missing.map((f) => f.label).join(', ')}.` } };
    }

    try {
      return { status: 200, body: await checkDocument(doc.id, submission, body.image, config, signal) };
    } catch (err) {
      return fail(err);
    }
  },

  /** A pile of unlabelled files: identify each, read each, then group them. */
  async sort(body, config, signal) {
    const files = (body?.files ?? [])
      .filter((f) => f?.image)
      .map((f, i) => ({ id: f.id ?? `file-${i + 1}`, name: f.name ?? `File ${i + 1}`, image: f.image }));

    if (!files.length) return { status: 400, body: { error: 'Add at least one document.' } };

    try {
      return { status: 200, body: await sortPile(files, config, signal) };
    } catch (err) {
      return fail(err);
    }
  },
};

/** Routes a request to a handler. Returns null for anything that is not an API path. */
export async function routeApi(pathname, method, body, config, signal) {
  if (pathname === '/api/config' && method === 'GET') return handlers.config(config);
  if (pathname === '/api/documents' && method === 'GET') return handlers.documents();
  if (pathname === '/api/read' && method === 'POST') return handlers.read(body, config, signal);
  if (pathname === '/api/check' && method === 'POST') return handlers.check(body, config, signal);
  if (pathname === '/api/sort' && method === 'POST') return handlers.sort(body, config, signal);
  return null;
}
