#!/usr/bin/env node
/**
 * Runs every synthetic case through the real pipeline and checks the answer
 * against the expected one. Also spot-checks that reading a document back
 * recovers the values printed on it.
 *
 *   npm run samples && npm test
 *   npm test -- pan          # only cases whose id contains "pan"
 *   npm test -- --read       # only the read-and-fill checks
 *
 * These are live calls, so a full run costs a few paise.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import { getDocument } from '../public/lib/documents.js';
import { checkDocument, readDocument } from '../src/core/verify.js';
import { DEFAULT_MODEL } from '../src/core/api.js';

const SAMPLES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples');

const C = { reset: '\x1b[0m', dim: '\x1b[2m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m' };
const paint = (colour, text) => `${C[colour]}${text}${C.reset}`;

const config = {
  apiKey: process.env.OPENROUTER_API_KEY,
  model: process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
};

const imageOf = async (file) => `data:image/png;base64,${(await readFile(path.join(SAMPLES, file))).toString('base64')}`;

/** Compare loosely — capitalisation, spacing and separators do not count. */
const loose = (value) => String(value ?? '').toLowerCase().replace(/[\s\-/,.]/g, '');

async function runChecks(cases) {
  const results = [];

  for (const testCase of cases) {
    process.stdout.write(`  ${testCase.id.padEnd(34)}`);
    try {
      const result = await checkDocument(testCase.document, testCase.submission, await imageOf(testCase.image), config);
      const passed = result.overall_verdict === testCase.expected_verdict;

      console.log(
        `${passed ? paint('green', 'PASS') : paint('red', 'FAIL')}  ` +
          `want ${testCase.expected_verdict.padEnd(14)} got ${result.overall_verdict.padEnd(14)} ` +
          paint('dim', `${(result.meta.latency_ms / 1000).toFixed(1)}s`),
      );

      if (!passed) {
        console.log(paint('dim', `      ${result.summary}`));
        for (const f of result.field_results.filter((f) => f.verdict === 'mismatch' || f.verdict === 'partial_match')) {
          console.log(paint('dim', `      · ${f.field}: ${f.verdict} — ${f.reason}`));
        }
      }
      results.push(passed);
    } catch (err) {
      console.log(`${paint('yellow', 'ERROR')} ${err.message}`);
      results.push(false);
    }
  }

  return results;
}

/** Read each document back and see how many printed fields we recover. */
async function runReads(manifest) {
  const results = [];

  for (const [docId, entry] of Object.entries(manifest.documents)) {
    const doc = getDocument(docId);
    process.stdout.write(`  ${docId.padEnd(34)}`);

    try {
      const read = await readDocument(docId, await imageOf(entry.image), config);
      const printed = doc.fields.filter((f) => entry.printed[f.key]);
      const right = printed.filter((f) => loose(read.extracted[f.key]) === loose(entry.printed[f.key]));
      const wrong = printed.filter((f) => read.extracted[f.key] && loose(read.extracted[f.key]) !== loose(entry.printed[f.key]));

      // Anything the document does not carry is allowed to come back empty; what
      // must never happen is a value that is confidently wrong.
      const passed = wrong.length === 0 && right.length >= Math.ceil(printed.length * 0.8);

      console.log(
        `${passed ? paint('green', 'PASS') : paint('red', 'FAIL')}  ` +
          `${String(right.length).padStart(2)}/${printed.length} fields read back exactly ` +
          paint('dim', `${(read.meta.latency_ms / 1000).toFixed(1)}s`),
      );

      for (const f of wrong) {
        console.log(paint('dim', `      · ${f.key}: read "${read.extracted[f.key]}", printed "${entry.printed[f.key]}"`));
      }
      results.push(passed);
    } catch (err) {
      console.log(`${paint('yellow', 'ERROR')} ${err.message}`);
      results.push(false);
    }
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => !a.startsWith('--'));
  const readsOnly = args.includes('--read');
  const checksOnly = args.includes('--check');

  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(SAMPLES, 'index.json'), 'utf8'));
  } catch {
    console.error('No samples found. Run `npm run samples` first.');
    process.exit(1);
  }

  console.log('');
  let results = [];

  if (!checksOnly) {
    console.log('Reading each document and comparing with what was printed on it\n');
    results = results.concat(await runReads(only ? { ...manifest, documents: Object.fromEntries(Object.entries(manifest.documents).filter(([id]) => id.includes(only))) } : manifest));
    console.log('');
  }

  if (!readsOnly) {
    console.log('Checking filled-in forms against their documents\n');
    results = results.concat(await runChecks(manifest.cases.filter((c) => !only || c.id.includes(only))));
  }

  const passed = results.filter(Boolean).length;
  const line = `${passed}/${results.length} checks passed`;
  console.log(`\n${passed === results.length ? paint('green', line) : paint('red', line)}\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
