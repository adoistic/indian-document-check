// Sorting out a pile of documents nobody has labelled.
//
// For each file: work out what it is, then read it properly using the form for
// that kind of document. Then group the lot by who they belong to — which is
// arithmetic, done in linking.js — and finally ask for the result in words.

import { getDocument } from '../../public/lib/documents.js';
import { identifyDocument, readDocument, localChecks, callModel, ReadError } from './verify.js';
import { factsFor, linkDocuments } from './linking.js';

/** How many documents we are willing to work on at once. */
const CONCURRENCY = 6;

async function inBatches(items, size, worker) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(worker))));
  }
  return results;
}

/**
 * One file: identify it, then read it with the right form.
 * Never throws — a file that cannot be read comes back marked as such, because
 * one bad photo should not sink the whole pile.
 */
async function processOne(file, config, signal) {
  const started = Date.now();

  try {
    const identify = await identifyDocument(file.image, config, signal);
    const type = identify.document?.type ?? 'other';
    const doc = getDocument(type);

    let extracted = {};
    let readMeta = null;

    if (doc && identify.document?.is_legible !== false) {
      try {
        const read = await readDocument(type, file.image, config, signal);
        extracted = read.extracted;
        readMeta = read.meta;
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        // Identification stands even if the detailed read failed.
      }
    }

    return {
      id: file.id,
      name: file.name ?? file.id,
      ok: true,
      type,
      typeName: doc?.name ?? identify.document?.name_if_other ?? 'Not a document we recognise',
      recognised: Boolean(doc),
      certainty: identify.document?.certainty ?? 'low',
      legible: identify.document?.is_legible !== false,
      notes: identify.document?.notes ?? '',
      fields: doc ? doc.fields.map((f) => ({ key: f.key, label: f.label, value: extracted[f.key] ?? null })) : [],
      extracted,
      identify,
      checks: doc ? localChecks(type, extracted) : [],
      elapsed_ms: Date.now() - started,
      cost: { identify: identify.meta?.usage ?? null, read: readMeta?.usage ?? null },
    };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return {
      id: file.id,
      name: file.name ?? file.id,
      ok: false,
      type: 'other',
      typeName: 'Could not be read',
      recognised: false,
      error: err instanceof ReadError ? err.message : 'This file could not be read.',
      fields: [],
      extracted: {},
      identify: {},
      checks: [],
      elapsed_ms: Date.now() - started,
    };
  }
}

// ── Putting the result into words ─────────────────────────────────────────

const NARRATIVE_SCHEMA = {
  name: 'pile_summary',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['headline', 'summary', 'entity_notes', 'extra_concerns'],
    properties: {
      headline: { type: 'string', description: 'One short line: how many people and organisations are in the pile. Plain words, no jargon.' },
      summary: { type: 'string', description: 'Two to four sentences telling somebody what they have got, how the documents connect, and what is missing or odd. Written for a clerk, not an engineer.' },
      entity_notes: {
        type: 'array',
        description: 'One per group, in the order given.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['entity_id', 'note'],
          properties: {
            entity_id: { type: 'string' },
            note: { type: 'string', description: 'One sentence: who or what this is and what the documents establish about them.' },
          },
        },
      },
      extra_concerns: {
        type: 'array',
        description: 'Anything a person should look at that the arithmetic would not have caught — two groups that look like the same person under different spellings, a document that does not fit, an expired paper. Empty if nothing.',
        items: { type: 'string' },
      },
    },
  },
};

/**
 * Strips reference numbers out of a sentence meant for the summary.
 *
 * The numbers are not the point of a written summary, and leaving them in
 * causes a specific, repeatable mistake: a GST number and the PAN contained
 * within it appear as two similar-looking strings, and get reported as a
 * transposition error on a document nobody has looked at. The numbers stay in
 * the interface and in the full record, where they belong.
 */
const withoutNumbers = (sentence) =>
  String(sentence ?? '')
    .replace(/\s*\((?=[A-Z0-9-]{8,}\))[A-Z0-9-]{8,}\)/g, '')
    .replace(/\b(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{7,}\b/g, 'that number')
    .replace(/\s{2,}/g, ' ');

/** The linking result, flattened into something readable to reason over. */
function describeForNarrative(result, documents) {
  const lines = [];

  for (const entity of result.entities) {
    const docs = entity.documents.map((id) => documents.find((d) => d.id === id)).filter(Boolean);
    lines.push(`${entity.id} — ${entity.kind === 'company' ? 'organisation' : 'person'}: ${entity.name}`);
    if (entity.dateOfBirth) lines.push(`  date of birth: ${entity.dateOfBirth}`);
    if (entity.address) lines.push(`  address: ${entity.address}`);
    lines.push(`  documents: ${docs.map((d) => d.typeName).join(', ')}`);

    // Only numbers actually printed on the documents. A number worked out from
    // inside another one reads here as a second, conflicting number and gets
    // reported as a clerical error that does not exist — and the connection it
    // supports is already spelled out under "Connections found" below.
    const printed = entity.identifiers.filter((i) => !i.derived);
    if (printed.length) lines.push(`  carries: ${printed.map((i) => i.type).join(', ')}`);
    for (const reason of [...new Set(entity.evidence)]) lines.push(`  grouped because: ${reason}`);
    lines.push('');
  }

  if (result.relationships.length) {
    lines.push('Connections found:');
    for (const rel of result.relationships) lines.push(`  ${rel.from_name} ${rel.kind} ${rel.to_name ?? '—'}: ${withoutNumbers(rel.reason)}`);
    lines.push('');
  }

  if (result.conflicts.length) {
    lines.push('Contradictions found:');
    for (const conflict of result.conflicts) lines.push(`  ${conflict.message}`);
    lines.push('');
  }

  const unrecognised = documents.filter((d) => !d.recognised);
  if (unrecognised.length) {
    lines.push(`Files that are not documents we handle: ${unrecognised.map((d) => `${d.name} (${d.typeName})`).join(', ')}`);
  }

  return lines.join('\n');
}

const NARRATIVE_SYSTEM = `You are handed the result of sorting a pile of Indian identity and business paperwork. The sorting has already been done by exact comparison of the numbers and names on each document — you are not being asked to redo it.

Your job is to put it into plain English for somebody at a counter.

- Say what is there, in ordinary words. "Five documents, all belonging to one man, plus his two businesses."
- Explain connections the way a person would. "The GST number contains his PAN, so the shop is registered in his own name."
- Do not repeat the reference numbers back unless one of them is the point.
- No jargon, no percentages, no talk of matching or algorithms.
- Raise anything a careful person would notice that pure comparison would miss: two groups that look like the same person spelt differently, a document that does not belong with the rest, a missing piece.
- If the grouping looks wrong to you, say so in extra_concerns. Do not pretend to be certain.

Two warnings about what you are reading, because getting these wrong invents problems that do not exist:
- An Indian GST number is *built out of* its holder's PAN — the PAN sits inside the middle of it. So a GST number and the PAN within it are one number, not two, and they can never contradict each other. Never call that a discrepancy or a clerical error.
- You are looking at a summary, not the documents themselves. Do not claim anything about how a document is printed, laid out or worded, and do not diagnose errors on it. If it is not stated here, it is not a concern.`;

/**
 * The whole job.
 *
 * @param {Array} files    [{ id, name, image }]
 * @param {object} config  { apiKey, model }
 */
export async function sortPile(files, config, signal) {
  if (!Array.isArray(files) || !files.length) throw new ReadError('No files were sent.', 400);
  if (files.length > 20) throw new ReadError('Twenty documents at a time is the limit. Try a smaller pile.', 400);

  const started = Date.now();
  const documents = await inBatches(files, CONCURRENCY, (file) => processOne(file, config, signal));

  const usable = documents.filter((d) => d.ok && d.recognised);
  const linked = linkDocuments(usable.map((entry) => factsFor(entry)));

  let narrative = null;
  if (linked.entities.length) {
    try {
      const { parsed } = await callModel({
        system: NARRATIVE_SYSTEM,
        user: describeForNarrative(linked, documents),
        schema: NARRATIVE_SCHEMA,
        config,
        signal,
      });
      narrative = parsed;
    } catch {
      // A missing summary is survivable; the grouping itself is the substance.
    }
  }

  return {
    documents,
    ...linked,
    narrative,
    meta: {
      files: files.length,
      recognised: usable.length,
      entities: linked.entities.length,
      elapsed_ms: Date.now() - started,
    },
  };
}
