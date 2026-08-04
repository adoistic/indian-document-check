#!/usr/bin/env node
/**
 * Scores the pile sorter against a dossier whose right answer is written down.
 *
 *   npm run bench            full pipeline — identify, read, group
 *   npm run bench -- --logic grouping only, using perfect reads. No API calls.
 *   npm run bench -- --runs 3   repeat and report the spread
 *
 * Four things are measured separately, because they fail for different reasons:
 *
 *   1. Identification — is each file recognised for what it is?
 *   2. Extraction     — are the reference numbers read off correctly?
 *   3. Grouping       — do documents end up with the right person or company?
 *   4. Connections    — is the director linked to his company, the shop to its
 *                       owner?
 *
 * Grouping is scored pairwise, the standard measure for this kind of problem:
 * of all the pairs of documents that belong together, how many were put
 * together, and of the pairs that were put together, how many belonged?
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import { sortPile } from '../src/core/pile.js';
import { factsFor, linkDocuments, normaliseId } from '../src/core/linking.js';
import { DEFAULT_MODEL } from '../src/core/api.js';

const DOSSIER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples', 'dossier');

const C = { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m' };
const paint = (colour, text) => `${C[colour]}${text}${C.reset}`;

const config = {
  apiKey: process.env.OPENROUTER_API_KEY,
  model: process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
};

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const grade = (value, floor) => paint(value >= floor ? 'green' : 'red', pct(value));

// ── Scoring ───────────────────────────────────────────────────────────────

/**
 * Pairwise precision and recall over "these two documents belong to the same
 * entity". Files with no expected entity — the receipt — are left out of the
 * pairing and scored separately.
 */
function scoreGrouping(manifest, result) {
  const truth = new Map();
  for (const file of manifest.files) if (file.expected_entity) truth.set(file.image, file.expected_entity);

  const predicted = new Map();
  for (const entity of result.entities) for (const id of entity.documents) predicted.set(id, entity.id);

  const ids = [...truth.keys()];
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const wrongPairs = [];

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const together = truth.get(ids[i]) === truth.get(ids[j]);
      const putTogether = predicted.has(ids[i]) && predicted.get(ids[i]) === predicted.get(ids[j]);

      if (together && putTogether) tp += 1;
      else if (!together && putTogether) {
        fp += 1;
        wrongPairs.push(`joined but should not be: ${ids[i]} + ${ids[j]}`);
      } else if (together && !putTogether) {
        fn += 1;
        wrongPairs.push(`should be together but were not: ${ids[i]} + ${ids[j]}`);
      }
    }
  }

  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  const expectedCount = new Set(truth.values()).size;
  const actualCount = new Set([...truth.keys()].map((id) => predicted.get(id)).filter(Boolean)).size;

  return { precision, recall, f1, tp, fp, fn, wrongPairs, expectedCount, actualCount };
}

function scoreIdentification(manifest, result) {
  const wrong = [];
  let right = 0;

  for (const file of manifest.files) {
    const found = result.documents.find((d) => d.id === file.image);
    const got = found?.type ?? 'missing';
    // Anything we do not have a form for is correct as long as it is not
    // claimed to be one of the documents we do.
    const ok = file.expected_type === 'other' ? !found?.recognised : got === file.expected_type;
    if (ok) right += 1;
    else wrong.push(`${file.image}: expected ${file.expected_type}, got ${got}`);
  }

  return { right, total: manifest.files.length, accuracy: right / manifest.files.length, wrong };
}

function scoreExtraction(manifest, result) {
  const wrong = [];
  let right = 0;
  let total = 0;

  for (const file of manifest.files) {
    const found = result.documents.find((d) => d.id === file.image);
    if (!found) continue;
    const facts = found.recognised ? factsFor({ id: found.id, type: found.type, extracted: found.extracted, identify: found.identify }) : null;

    for (const [type, expected] of Object.entries(file.expect_identifiers ?? {})) {
      total += 1;
      const want = normaliseId(type, expected);
      const got = facts?.identifiers.find((i) => i.type === type && !i.derived)?.value ?? null;
      if (got === want) right += 1;
      else wrong.push(`${file.image} ${type}: expected ${want}, got ${got ?? 'nothing'}`);
    }
  }

  return { right, total, accuracy: total ? right / total : 1, wrong };
}

function scoreRelationships(manifest, result) {
  const nameOf = (key) => manifest.entities[key]?.name;
  const missing = [];
  let right = 0;

  for (const expected of manifest.relationships) {
    const from = nameOf(expected.from);
    const to = nameOf(expected.to);
    const found = result.relationships.some(
      (r) => (r.from_name === from && r.to_name === to) || (r.from_name === to && r.to_name === from),
    );
    if (found) right += 1;
    else missing.push(`${from} → ${to}: ${expected.why}`);
  }

  return { right, total: manifest.relationships.length, accuracy: manifest.relationships.length ? right / manifest.relationships.length : 1, missing };
}

// ── Runs ──────────────────────────────────────────────────────────────────

/** Grouping only, fed the printed values as if every read were perfect. */
function logicOnly(manifest) {
  const entries = manifest.files
    .filter((f) => f.expected_type !== 'other')
    .map((file) => ({
      id: file.image,
      type: file.expected_type,
      extracted: file.printed,
      identify: {
        belongs_to: { kind: 'unclear', primary_name: null },
        people: [],
        organisations: [],
        identifiers: [],
      },
    }));

  return {
    documents: manifest.files.map((f) => ({ id: f.image, type: f.expected_type, recognised: f.expected_type !== 'other', extracted: f.printed, identify: {} })),
    ...linkDocuments(entries.map(factsFor)),
    narrative: null,
  };
}

async function fullRun(manifest) {
  const files = await Promise.all(
    manifest.files.map(async (file) => ({
      id: file.image,
      name: file.image,
      image: `data:image/png;base64,${(await readFile(path.join(DOSSIER, file.image))).toString('base64')}`,
    })),
  );
  return sortPile(files, config);
}

function report(manifest, result, { logic }) {
  const identification = logic ? null : scoreIdentification(manifest, result);
  const extraction = logic ? null : scoreExtraction(manifest, result);
  const grouping = scoreGrouping(manifest, result);
  const relationships = scoreRelationships(manifest, result);

  console.log(paint('bold', '\n  Scorecard\n'));

  if (identification) {
    console.log(`  Identification   ${grade(identification.accuracy, 1)}   ${identification.right}/${identification.total} files recognised for what they are`);
    for (const line of identification.wrong) console.log(paint('red', `                   · ${line}`));
  }

  if (extraction) {
    console.log(`  Extraction       ${grade(extraction.accuracy, 1)}   ${extraction.right}/${extraction.total} reference numbers read exactly`);
    for (const line of extraction.wrong) console.log(paint('red', `                   · ${line}`));
  }

  console.log(
    `  Grouping         ${grade(grouping.f1, 1)}   F1 · precision ${pct(grouping.precision)}, recall ${pct(grouping.recall)} ` +
      paint('dim', `(${grouping.tp} pairs right, ${grouping.fp} wrongly joined, ${grouping.fn} wrongly split)`),
  );
  console.log(paint('dim', `                   ${grouping.actualCount} groups found, ${grouping.expectedCount} expected`));
  for (const line of grouping.wrongPairs) console.log(paint('red', `                   · ${line}`));

  console.log(`  Connections      ${grade(relationships.accuracy, 1)}   ${relationships.right}/${relationships.total} links between people and their businesses`);
  for (const line of relationships.missing) console.log(paint('red', `                   · missed ${line}`));

  const setAside = manifest.files.filter((f) => !f.expected_entity);
  if (setAside.length && !logic) {
    const ok = setAside.every((f) => !result.entities.some((e) => e.documents.includes(f.image)));
    console.log(`  Set aside        ${paint(ok ? 'green' : 'red', ok ? 'yes' : 'no')}    ${setAside.map((f) => f.image).join(', ')} kept out of every group`);
  }

  if (result.conflicts?.length) {
    console.log(paint('bold', '\n  Contradictions raised'));
    for (const conflict of result.conflicts) console.log(`    · ${conflict.message}`);
  }

  console.log(paint('bold', '\n  Groups found\n'));
  for (const entity of result.entities) {
    console.log(`    ${entity.kind === 'company' ? '🏢' : '👤'}  ${paint('bold', entity.name)} ${paint('dim', `(${entity.documents.length} document${entity.documents.length === 1 ? '' : 's'})`)}`);
    for (const reason of [...new Set(entity.evidence)]) console.log(paint('dim', `        ${reason}`));
  }

  if (result.relationships.length) {
    console.log(paint('bold', '\n  Connections found\n'));
    for (const rel of result.relationships) console.log(`    ${rel.from_name} → ${rel.to_name ?? '—'}\n${paint('dim', `        ${rel.reason}`)}`);
  }

  if (result.narrative) {
    console.log(paint('bold', '\n  Written summary\n'));
    console.log(`    ${result.narrative.headline}`);
    console.log(paint('dim', `    ${result.narrative.summary}`));
    for (const concern of result.narrative.extra_concerns ?? []) console.log(paint('yellow', `    ! ${concern}`));
  }

  const scores = [grouping.f1, relationships.accuracy, ...(identification ? [identification.accuracy] : []), ...(extraction ? [extraction.accuracy] : [])];
  return scores.every((s) => s >= 1);
}

async function main() {
  const args = process.argv.slice(2);
  const logic = args.includes('--logic');
  const runs = Number(args[args.indexOf('--runs') + 1]) || 1;

  const manifest = JSON.parse(await readFile(path.join(DOSSIER, 'index.json'), 'utf8'));

  console.log(
    paint('bold', `\n  ${logic ? 'Grouping only — perfect reads, no API calls' : `Full pipeline over ${manifest.files.length} files`}`) +
      (logic ? '' : paint('dim', `  ·  ${config.model}`)),
  );

  const outcomes = [];
  for (let run = 1; run <= runs; run++) {
    if (runs > 1) console.log(paint('dim', `\n  ── run ${run} of ${runs} ──`));
    const started = Date.now();
    const result = logic ? logicOnly(manifest) : await fullRun(manifest);
    const perfect = report(manifest, result, { logic });
    if (!logic) console.log(paint('dim', `\n  ${((Date.now() - started) / 1000).toFixed(1)}s for ${manifest.files.length} files`));
    outcomes.push(perfect);
  }

  const clean = outcomes.filter(Boolean).length;
  console.log(
    `\n  ${clean === outcomes.length ? paint('green', 'Everything scored full marks') : paint('red', `${clean}/${outcomes.length} runs scored full marks`)}\n`,
  );
  process.exit(clean === outcomes.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
