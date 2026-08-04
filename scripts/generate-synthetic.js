#!/usr/bin/env node
/**
 * Generates synthetic Aadhaar-style card images plus the form submissions to test
 * them against. Everything here is fabricated: the names, addresses and numbers
 * belong to nobody. Each card is stamped as a synthetic specimen.
 *
 *   npm run synth
 *
 * Output lands in ./samples (git-ignored) as PNGs plus an index.json manifest.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { formatAadhaar, generateAadhaar } from '../src/aadhaar.js';
import { jpegToPdf } from './lib/jpeg-to-pdf.js';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples');

// Seeded PRNG so re-running produces the same fixtures.
function mulberry32(seed) {
  return function rand() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260805);

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Greedy wrap so long addresses fit the card. */
function wrap(text, maxChars) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (line && (line + ' ' + word).length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** DD/MM/YYYY, the format Aadhaar prints. */
function printedDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const FONT = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

function photoPlaceholder(x, y, w, h) {
  const cx = x + w / 2;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#dfe3e8" stroke="#b9c0c8" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${y + h * 0.34}" r="${w * 0.22}" fill="#9aa4b0"/>
    <path d="M ${cx - w * 0.34} ${y + h} a ${w * 0.34} ${h * 0.34} 0 0 1 ${w * 0.68} 0 Z" fill="#9aa4b0"/>`;
}

function qrPlaceholder(x, y, size, seed) {
  const cells = 11;
  const c = size / cells;
  const r = mulberry32(seed);
  let squares = `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#ffffff" stroke="#333" stroke-width="1"/>`;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const finder = (i < 3 && j < 3) || (i < 3 && j > cells - 4) || (i > cells - 4 && j < 3);
      if (finder || r() > 0.55) {
        squares += `<rect x="${x + j * c}" y="${y + i * c}" width="${c}" height="${c}" fill="#111"/>`;
      }
    }
  }
  return squares;
}

/**
 * An e-Aadhaar style sheet: front panel (photo, name, DOB, gender, number) above
 * a back panel (address, QR, number) — the same layout UIDAI's PDF download uses.
 */
function aadhaarSvg(card) {
  const W = 1000;
  const H = 700;
  const number = formatAadhaar(card.aadhaar_number);
  const addressLines = wrap(card.address, 46);
  const dobLine = card.year_only ? `Year of Birth: ${card.date_of_birth.slice(0, 4)}` : `DOB: ${printedDate(card.date_of_birth)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <rect width="${W}" height="${H}" fill="#f4f2ee"/>

  <!-- ── Front panel ─────────────────────────────── -->
  <g>
    <rect x="30" y="24" width="940" height="300" rx="6" fill="#ffffff" stroke="#d5d0c8"/>
    <rect x="30" y="24" width="940" height="46" rx="6" fill="#ef7c22"/>
    <rect x="30" y="58" width="940" height="12" fill="#ef7c22"/>
    <text x="500" y="55" text-anchor="middle" fill="#ffffff" font-size="22" font-weight="600" letter-spacing="1.5">GOVERNMENT OF INDIA</text>

    ${photoPlaceholder(60, 96, 150, 162)}

    <text x="240" y="122" font-size="30" font-weight="700" fill="#1a1a1a">${esc(card.name)}</text>
    <text x="240" y="164" font-size="21" fill="#2a2a2a">${esc(dobLine)}</text>
    <text x="240" y="200" font-size="21" fill="#2a2a2a">Gender: ${esc(card.gender)}</text>
    ${card.guardian_name ? `<text x="240" y="236" font-size="19" fill="#3a3a3a">S/O: ${esc(card.guardian_name)}</text>` : ''}

    <rect x="30" y="270" width="940" height="54" fill="#f7f5f1"/>
    <text x="500" y="308" text-anchor="middle" font-size="34" font-weight="700" letter-spacing="6" fill="#1a1a1a">${esc(number)}</text>
  </g>

  <!-- ── Back panel ──────────────────────────────── -->
  <g>
    <rect x="30" y="352" width="940" height="300" rx="6" fill="#ffffff" stroke="#d5d0c8"/>
    <rect x="30" y="352" width="940" height="46" rx="6" fill="#12864f"/>
    <rect x="30" y="386" width="940" height="12" fill="#12864f"/>
    <text x="500" y="383" text-anchor="middle" fill="#ffffff" font-size="20" font-weight="600" letter-spacing="1.2">UNIQUE IDENTIFICATION AUTHORITY OF INDIA</text>

    <text x="60" y="432" font-size="18" font-weight="700" fill="#555">Address:</text>
    ${addressLines
      .map((line, i) => `<text x="60" y="${462 + i * 28}" font-size="20" fill="#1a1a1a">${esc(line)}</text>`)
      .join('\n    ')}

    ${qrPlaceholder(800, 420, 140, card.seed)}

    <rect x="30" y="598" width="940" height="54" fill="#f7f5f1"/>
    <text x="500" y="636" text-anchor="middle" font-size="34" font-weight="700" letter-spacing="6" fill="#1a1a1a">${esc(number)}</text>
  </g>

  <text x="500" y="678" text-anchor="middle" font-size="15" fill="#8b8b8b" letter-spacing="1">SYNTHETIC SPECIMEN — GENERATED TEST DATA, NOT A REAL DOCUMENT</text>
</svg>`;
}

/** A deliberately wrong upload: a shop receipt, so the model must refuse to judge. */
function receiptSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="700" viewBox="0 0 620 700" font-family="${FONT}">
  <rect width="620" height="700" fill="#efece6"/>
  <rect x="90" y="40" width="440" height="620" fill="#ffffff" stroke="#ddd"/>
  <text x="310" y="100" text-anchor="middle" font-size="26" font-weight="700">SHREE GANESH STORES</text>
  <text x="310" y="130" text-anchor="middle" font-size="15" fill="#666">Ashok Nagar, Pune 411007</text>
  <line x1="130" y1="160" x2="490" y2="160" stroke="#bbb" stroke-dasharray="4 4"/>
  ${[
    ['Toor Dal 1kg', '182.00'],
    ['Mustard Oil 1L', '164.50'],
    ['Basmati Rice 5kg', '640.00'],
    ['Tea Powder 500g', '245.00'],
    ['Detergent Bar x3', '96.00'],
  ]
    .map(
      ([item, price], i) =>
        `<text x="140" y="${200 + i * 36}" font-size="18">${item}</text><text x="480" y="${200 + i * 36}" font-size="18" text-anchor="end">${price}</text>`,
    )
    .join('\n  ')}
  <line x1="130" y1="400" x2="490" y2="400" stroke="#bbb" stroke-dasharray="4 4"/>
  <text x="140" y="436" font-size="20" font-weight="700">TOTAL</text>
  <text x="480" y="436" font-size="20" font-weight="700" text-anchor="end">1327.50</text>
  <text x="310" y="500" text-anchor="middle" font-size="15" fill="#666">Thank you — visit again</text>
  <text x="310" y="640" text-anchor="middle" font-size="13" fill="#999">SYNTHETIC SPECIMEN — GENERATED TEST DATA</text>
</svg>`;
}

// ── The people on the cards ───────────────────────────────────
const PEOPLE = [
  {
    seed: 11,
    name: 'Rajesh Kumar Sharma',
    date_of_birth: '1988-04-17',
    gender: 'Male',
    guardian_name: 'Mahesh Chand Sharma',
    address: 'H.No 42, Gandhi Nagar, Sector 9, Rohini, New Delhi, Delhi - 110085',
  },
  {
    seed: 22,
    name: 'Priya Venkatesan',
    date_of_birth: '1995-11-02',
    gender: 'Female',
    guardian_name: 'S Venkatesan',
    address: '18/3 Bharathi Street, Adambakkam, Chennai, Tamil Nadu - 600088',
  },
  {
    seed: 33,
    name: 'Mohammed Arif Ansari',
    date_of_birth: '1979-01-30',
    gender: 'Male',
    guardian_name: 'Abdul Rahim Ansari',
    address: 'Flat 604, Sunrise Apartments, Andheri East, Mumbai, Maharashtra - 400069',
  },
  {
    seed: 44,
    name: 'Lakshmi Devi Reddy',
    date_of_birth: '1992-07-25',
    gender: 'Female',
    guardian_name: 'K Narasimha Reddy',
    address: '7-1-58/2 Ameerpet Main Road, Hyderabad, Telangana - 500016',
  },
  {
    seed: 55,
    name: 'Sandeep Joshi',
    date_of_birth: '1985-09-09',
    gender: 'Male',
    guardian_name: 'Ramesh Joshi',
    address: 'Plot 12, Vasant Vihar Colony, Bhopal, Madhya Pradesh - 462003',
  },
].map((p) => ({ ...p, aadhaar_number: generateAadhaar(rand) }));

/** Change one digit so the number stays 12 digits but no longer matches the card. */
function corruptDigit(number, position = 5) {
  const digits = number.split('');
  digits[position] = String((Number(digits[position]) + 3) % 10);
  return digits.join('');
}

const submissionOf = (person, overrides = {}) => ({
  name: person.name,
  date_of_birth: person.date_of_birth,
  gender: person.gender,
  address: person.address,
  aadhaar_number: formatAadhaar(person.aadhaar_number),
  guardian_name: person.guardian_name,
  ...overrides,
});

const CASES = [
  {
    id: '01-exact-match',
    description: 'Every field typed exactly as printed on the card.',
    card: PEOPLE[0],
    submission: submissionOf(PEOPLE[0]),
    expected_verdict: 'match',
  },
  {
    id: '02-abbreviated-middle-name',
    description: 'Middle name abbreviated and the address reworded — same person, cosmetic differences.',
    card: PEOPLE[1],
    submission: submissionOf(PEOPLE[1], {
      name: 'Priya V.',
      address: 'No. 18/3, Bharathi St., Adambakkam, Chennai 600088, Tamil Nadu',
    }),
    expected_verdict: 'partial_match',
  },
  {
    id: '03-wrong-date-of-birth',
    description: 'Date of birth off by several years.',
    card: PEOPLE[2],
    submission: submissionOf(PEOPLE[2], { date_of_birth: '1983-01-30' }),
    expected_verdict: 'mismatch',
  },
  {
    id: '04-aadhaar-digit-typo',
    description: 'One digit of the Aadhaar number typed wrongly.',
    card: PEOPLE[3],
    submission: submissionOf(PEOPLE[3], { aadhaar_number: formatAadhaar(corruptDigit(PEOPLE[3].aadhaar_number)) }),
    expected_verdict: 'mismatch',
  },
  {
    id: '05-different-address',
    description: 'A completely different city and PIN code from the one on the card.',
    card: PEOPLE[4],
    submission: submissionOf(PEOPLE[4], { address: '221B Nehru Road, Kalyani, Nadia, West Bengal - 741235' }),
    expected_verdict: 'mismatch',
  },
  {
    id: '06-year-of-birth-only',
    description: 'The card prints only a year of birth; the submitted full date falls inside it.',
    card: { ...PEOPLE[0], seed: 66, year_only: true },
    submission: submissionOf(PEOPLE[0], { date_of_birth: '1988-02-03' }),
    expected_verdict: 'partial_match',
  },
  {
    id: '07-impostor',
    description: 'Someone else entirely submitted against this card.',
    card: PEOPLE[1],
    submission: submissionOf(PEOPLE[1], {
      name: 'Anita Krishnan',
      date_of_birth: '1990-03-14',
      guardian_name: 'R Krishnan',
    }),
    expected_verdict: 'mismatch',
  },
  {
    id: '08-not-an-id-document',
    description: 'A grocery receipt uploaded instead of an Aadhaar card.',
    card: null,
    submission: submissionOf(PEOPLE[2]),
    expected_verdict: 'undetermined',
  },
];

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const manifest = { generated_for: 'aadhaar-form-verifier', note: 'All data is fabricated.', cases: [] };

  for (const testCase of CASES) {
    const svg = testCase.card ? aadhaarSvg(testCase.card) : receiptSvg();
    const image = `${testCase.id}.png`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(OUT_DIR, image));

    manifest.cases.push({
      id: testCase.id,
      description: testCase.description,
      expected_verdict: testCase.expected_verdict,
      image,
      card: testCase.card
        ? { ...testCase.card, aadhaar_number: formatAadhaar(testCase.card.aadhaar_number) }
        : { type: 'grocery-receipt' },
      submission: testCase.submission,
    });

    console.log(`  ✓ ${image.padEnd(30)} expected: ${testCase.expected_verdict}`);
  }

  // One case also gets a PDF, so the browser's PDF → image path has something to chew on.
  const pdfCase = CASES[0];
  const jpeg = await sharp(Buffer.from(aadhaarSvg(pdfCase.card))).jpeg({ quality: 90 }).toBuffer();
  const { width, height } = await sharp(jpeg).metadata();
  await writeFile(path.join(OUT_DIR, `${pdfCase.id}.pdf`), jpegToPdf(jpeg, width, height));
  manifest.pdf_fixture = `${pdfCase.id}.pdf`;
  console.log(`  ✓ ${`${pdfCase.id}.pdf`.padEnd(30)} (same card, as a PDF)`);

  await writeFile(path.join(OUT_DIR, 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n${CASES.length} synthetic cases written to ./samples\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
