#!/usr/bin/env node
/**
 * Copies the PDF reader out of node_modules and into public/vendor.
 *
 * PDFs are turned into pictures in the browser, so the library has to be served
 * as a static file. Cloudflare only uploads ./public, hence the copy rather
 * than serving node_modules directly.
 */
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FROM = path.join(ROOT, 'node_modules', 'pdfjs-dist', 'build');
const TO = path.join(ROOT, 'public', 'vendor', 'pdfjs');

const FILES = ['pdf.mjs', 'pdf.worker.mjs'];

await mkdir(TO, { recursive: true });
for (const file of FILES) {
  await copyFile(path.join(FROM, file), path.join(TO, file));
  console.log(`  ✓ public/vendor/pdfjs/${file}`);
}
