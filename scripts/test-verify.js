#!/usr/bin/env node
/**
 * Runs every synthetic fixture through the real verification pipeline and checks
 * the model's overall verdict against the expected one.
 *
 *   npm run synth && npm run test:verify
 *   npm run test:verify -- 03            # only cases whose id contains "03"
 *
 * This makes live OpenRouter calls, so it costs a few fractions of a cent.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import { verifySubmission } from '../src/verify.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = path.join(ROOT, 'samples');

const COLOR = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

const paint = (color, text) => `${COLOR[color]}${text}${COLOR.reset}`;

async function main() {
  const filter = process.argv[2];

  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(SAMPLES, 'index.json'), 'utf8'));
  } catch {
    console.error('No fixtures found. Run `npm run synth` first.');
    process.exit(1);
  }

  const cases = manifest.cases.filter((c) => !filter || c.id.includes(filter));
  if (!cases.length) {
    console.error(`No cases match "${filter}".`);
    process.exit(1);
  }

  console.log(`\nRunning ${cases.length} case(s) against ${process.env.OPENROUTER_MODEL ?? 'google/gemini-3.1-flash-lite'}\n`);

  const results = [];

  for (const testCase of cases) {
    const image = await readFile(path.join(SAMPLES, testCase.image));
    process.stdout.write(`  ${testCase.id.padEnd(30)}`);

    try {
      const result = await verifySubmission(testCase.submission, `data:image/png;base64,${image.toString('base64')}`);
      const actual = result.overall_verdict;
      const passed = actual === testCase.expected_verdict;

      console.log(
        `${passed ? paint('green', 'PASS') : paint('red', 'FAIL')}  ` +
          `expected ${testCase.expected_verdict.padEnd(14)} got ${actual.padEnd(14)} ` +
          paint('dim', `${(result.meta.latency_ms / 1000).toFixed(1)}s`),
      );

      if (!passed) {
        console.log(paint('dim', `      ${result.summary}`));
        for (const f of result.field_results.filter((f) => f.verdict === 'mismatch' || f.verdict === 'partial_match')) {
          console.log(paint('dim', `      · ${f.field}: ${f.verdict} — ${f.reason}`));
        }
      }

      results.push({ id: testCase.id, passed, expected: testCase.expected_verdict, actual });
    } catch (err) {
      console.log(`${paint('yellow', 'ERROR')} ${err.message}`);
      results.push({ id: testCase.id, passed: false, expected: testCase.expected_verdict, actual: `error: ${err.message}` });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const line = `${passed}/${results.length} cases matched the expected verdict`;
  console.log(`\n${passed === results.length ? paint('green', line) : paint('red', line)}\n`);

  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
