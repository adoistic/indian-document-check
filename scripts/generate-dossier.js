#!/usr/bin/env node
/**
 * Builds one deliberately awkward pile of documents, with the right answer
 * written down alongside it, so the sorting can be scored rather than admired.
 *
 *   npm run dossier
 *
 * The pile is designed around the cases that are actually hard:
 *
 *   - A man whose six documents share no single reference number between them,
 *     so they can only be grouped by name plus date of birth or address.
 *   - One of those six spells his name the other common way (Sandip, not
 *     Sandeep). It must still land in his group.
 *   - A second man with exactly the same name, a different date of birth and a
 *     different address. He must NOT land in that group. This is the pair that
 *     separates real matching from string comparison.
 *   - A shop registered on his personal PAN, reachable only by pulling the PAN
 *     out of the middle of the GST number.
 *   - A company that names him as a director.
 *   - Two people with nothing to do with any of it.
 *   - A grocery receipt.
 *
 * Everything is invented.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { getDocument } from '../public/lib/documents.js';
import { gstinCheckChar, verhoeffCheckDigit } from '../public/lib/validators.js';
import { renderDocument } from './render/templates.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples', 'dossier');

const gst = (stateCode, pan) => {
  const first14 = `${stateCode}${pan}1Z`;
  return first14 + gstinCheckChar(first14);
};

const aadhaar = (elevenDigits) => {
  const full = elevenDigits + verhoeffCheckDigit(elevenDigits);
  return `${full.slice(0, 4)} ${full.slice(4, 8)} ${full.slice(8)}`;
};

// ── The cast ──────────────────────────────────────────────────────────────

const SANDEEP = {
  name: 'Sandeep Joshi',
  father: 'Ramesh Joshi',
  dob: '1985-09-09',
  address: 'Plot 12, Vasant Vihar Colony, Bhopal, Madhya Pradesh - 462003',
  pan: 'BXQPJ7412K', // 4th character P — an individual. 5th J — Joshi.
  aadhaar: aadhaar('47210938265'),
};

const IMPOSTER_TWIN = {
  // Same name, different man. Nothing else about him agrees.
  name: 'Sandeep Joshi',
  father: 'Vijay Joshi',
  dob: '1971-02-24',
  address: '9 Kasturba Road, Jabalpur, Madhya Pradesh - 482001',
};

const SHOP_GSTIN = gst('23', SANDEEP.pan); // A proprietorship: registered on his own PAN.
const COMPANY_PAN = 'AABCJ5521M'; // 4th character C — the company's own PAN, not his.

const FILES = [
  // ── Sandeep Joshi, six documents, no shared number between them ──────
  {
    file: 'sandeep-aadhaar',
    type: 'aadhaar',
    entity: 'sandeep',
    values: {
      name: SANDEEP.name,
      date_of_birth: SANDEEP.dob,
      gender: 'Male',
      address: SANDEEP.address,
      aadhaar_number: SANDEEP.aadhaar,
      guardian_name: SANDEEP.father,
    },
    expect_identifiers: { aadhaar: SANDEEP.aadhaar },
  },
  {
    file: 'sandeep-pan',
    type: 'pan',
    entity: 'sandeep',
    values: { name: SANDEEP.name, father_name: SANDEEP.father, date_of_birth: SANDEEP.dob, pan_number: SANDEEP.pan },
    expect_identifiers: { pan: SANDEEP.pan },
  },
  {
    file: 'sandeep-voter-id',
    type: 'voter_id',
    entity: 'sandeep',
    values: {
      name: SANDEEP.name,
      guardian_name: SANDEEP.father,
      gender: 'Male',
      date_of_birth: SANDEEP.dob,
      address: SANDEEP.address,
      epic_number: 'MPX2947183',
    },
    expect_identifiers: { voter_id: 'MPX2947183' },
  },
  {
    file: 'sandeep-driving-licence',
    type: 'driving_licence',
    entity: 'sandeep',
    note: 'Name spelt Sandip. Same man.',
    values: {
      name: 'Sandip Joshi',
      guardian_name: SANDEEP.father,
      date_of_birth: SANDEEP.dob,
      address: SANDEEP.address,
      licence_number: 'MP04 20120004871',
      blood_group: 'B+',
      valid_till: '2032-03-14',
      vehicle_classes: 'LMV',
    },
    expect_identifiers: { driving_licence: 'MP0420120004871' },
  },
  {
    file: 'sandeep-din-letter',
    type: 'din_letter',
    entity: 'sandeep',
    values: {
      name: SANDEEP.name,
      din: '04728316',
      father_name: SANDEEP.father,
      date_of_birth: SANDEEP.dob,
      address: SANDEEP.address,
      date_of_allotment: '2013-04-02',
    },
    expect_identifiers: { din: '04728316' },
  },
  {
    file: 'sandeep-passbook',
    type: 'bank_passbook',
    entity: 'sandeep',
    note: 'No date of birth on it. Groups by name and address.',
    values: {
      account_holder: SANDEEP.name,
      account_number: '30412876554109',
      ifsc: 'BNBI0004412',
      bank_name: 'Bharat National Bank',
      branch: 'Bhopal Main Branch',
      address: SANDEEP.address,
      customer_id: '884213907',
    },
    expect_identifiers: { bank_account: '30412876554109' },
  },

  // ── His shop: findable only through the PAN inside the GST number ────
  {
    file: 'joshi-electricals-gst',
    type: 'gst_certificate',
    entity: 'joshi_electricals',
    values: {
      legal_name: 'Joshi Electricals',
      trade_name: 'Joshi Electricals & Hardware',
      gstin: SHOP_GSTIN,
      address: 'Shop 7, New Market, Bhopal, Madhya Pradesh - 462003',
      constitution: 'Proprietorship',
      registration_date: '2019-07-01',
    },
    expect_identifiers: { gstin: SHOP_GSTIN },
  },

  // ── His company: findable through the directors named on it ──────────
  {
    file: 'joshi-systems-incorporation',
    type: 'incorporation',
    entity: 'joshi_systems',
    values: {
      company_name: 'Joshi Systems Private Limited',
      cin: 'U28733MP2013PTC828687',
      date_of_incorporation: '2013-05-22',
      registered_office: SANDEEP.address,
      company_pan: COMPANY_PAN,
      directors: 'Sandeep Joshi, Lakshmi Devi Reddy',
    },
    expect_identifiers: { cin: 'U28733MP2013PTC828687', pan: COMPANY_PAN },
  },

  // ── The trap: same name, different man ───────────────────────────────
  {
    file: 'other-sandeep-voter-id',
    type: 'voter_id',
    entity: 'sandeep_of_jabalpur',
    note: 'Identical name to the first man. Everything else differs.',
    values: {
      name: IMPOSTER_TWIN.name,
      guardian_name: IMPOSTER_TWIN.father,
      gender: 'Male',
      date_of_birth: IMPOSTER_TWIN.dob,
      address: IMPOSTER_TWIN.address,
      epic_number: 'MPY8813047',
    },
    expect_identifiers: { voter_id: 'MPY8813047' },
  },

  // ── Two unrelated people ─────────────────────────────────────────────
  {
    file: 'priya-passport',
    type: 'passport',
    entity: 'priya',
    values: {
      surname: 'Venkatesan',
      given_name: 'Priya',
      date_of_birth: '1995-11-02',
      gender: 'Female',
      place_of_birth: 'Chennai',
      passport_number: 'N4820613',
      date_of_issue: '2019-06-14',
      date_of_expiry: '2029-06-13',
    },
    expect_identifiers: { passport: 'N4820613' },
  },
  {
    file: 'priya-birth-certificate',
    type: 'birth_certificate',
    entity: 'priya',
    note: 'Shares no number with the passport. Groups by name and date of birth.',
    values: {
      name: 'Priya Venkatesan',
      date_of_birth: '1995-11-02',
      place_of_birth: 'District Hospital, Chennai',
      gender: 'Female',
      father_name: 'S Venkatesan',
      mother_name: 'Meenakshi Venkatesan',
      registration_number: 'BRN/1995/TN/7441946',
      date_of_registration: '1995-11-28',
    },
    expect_identifiers: { birth_registration: 'BRN/1995/TN/7441946' },
  },
  {
    file: 'kavita-ration-card',
    type: 'ration_card',
    entity: 'kavita',
    values: {
      head_of_family: 'Kavita Bai Meena',
      card_number: 'RJ-2019-4471820395',
      category: 'Priority household (PHH)',
      address: 'Ward 4, Village Bagdi, Tehsil Malpura, Tonk, Rajasthan - 304502',
      member_count: '5',
      fps_name: 'FPS Ward 7',
    },
    expect_identifiers: { ration_card: 'RJ20194471820395' },
  },
];

/** What the sorting is expected to conclude. */
const EXPECTED_RELATIONSHIPS = [
  {
    from: 'sandeep',
    to: 'joshi_electricals',
    why: 'The GST number on the shop contains his personal PAN, which is how a proprietorship is registered.',
  },
  {
    from: 'sandeep',
    to: 'joshi_systems',
    why: 'He is named as a director on the certificate of incorporation.',
  },
];

function receiptSvg() {
  const items = [
    ['Copper Wire 90m', '2450.00'],
    ['MCB 32A x4', '1180.00'],
    ['Switch Plate x12', '936.00'],
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="620" viewBox="0 0 620 620" font-family="-apple-system, Helvetica, Arial, sans-serif">
  <rect width="620" height="620" fill="#efece6"/>
  <rect x="90" y="40" width="440" height="540" fill="#fff" stroke="#ddd"/>
  <text x="310" y="100" text-anchor="middle" font-size="24" font-weight="700">NEW MARKET HARDWARE</text>
  <text x="310" y="128" text-anchor="middle" font-size="14" fill="#666">Bhopal 462003</text>
  <line x1="130" y1="156" x2="490" y2="156" stroke="#bbb" stroke-dasharray="4 4"/>
  ${items
    .map(([item, price], i) =>
      `<text x="140" y="${196 + i * 36}" font-size="17">${item}</text><text x="480" y="${196 + i * 36}" font-size="17" text-anchor="end">${price}</text>`)
    .join('\n  ')}
  <line x1="130" y1="330" x2="490" y2="330" stroke="#bbb" stroke-dasharray="4 4"/>
  <text x="140" y="366" font-size="19" font-weight="700">TOTAL</text>
  <text x="480" y="366" font-size="19" font-weight="700" text-anchor="end">4566.00</text>
  <text x="310" y="430" text-anchor="middle" font-size="14" fill="#666">Cash — thank you</text>
  <text x="310" y="560" text-anchor="middle" font-size="12" fill="#999">SYNTHETIC SPECIMEN — SAMPLE DATA</text>
</svg>`;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const manifest = {
    note: 'One pile of documents with the right answer written down. Everything is invented.',
    files: [],
    entities: {
      sandeep: { kind: 'person', name: 'Sandeep Joshi', about: 'The man the pile is mostly about.' },
      joshi_electricals: { kind: 'company', name: 'Joshi Electricals', about: 'His shop, a proprietorship.' },
      joshi_systems: { kind: 'company', name: 'Joshi Systems Private Limited', about: 'A company he is a director of.' },
      sandeep_of_jabalpur: { kind: 'person', name: 'Sandeep Joshi', about: 'A different man with the same name.' },
      priya: { kind: 'person', name: 'Priya Venkatesan', about: 'Unrelated.' },
      kavita: { kind: 'person', name: 'Kavita Bai Meena', about: 'Unrelated.' },
    },
    relationships: EXPECTED_RELATIONSHIPS,
  };

  let seed = 401;
  for (const entry of FILES) {
    const doc = getDocument(entry.type);
    const image = `${entry.file}.png`;
    await sharp(Buffer.from(renderDocument(doc, entry.values, (seed += 23))))
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, image));

    manifest.files.push({
      image,
      expected_type: entry.type,
      expected_entity: entry.entity,
      expect_identifiers: entry.expect_identifiers,
      note: entry.note ?? null,
      printed: entry.values,
    });
    console.log(`  ✓ ${image.padEnd(34)} ${doc.name}${entry.note ? `  — ${entry.note}` : ''}`);
  }

  await sharp(Buffer.from(receiptSvg())).png().toFile(path.join(OUT, 'hardware-receipt.png'));
  manifest.files.push({
    image: 'hardware-receipt.png',
    expected_type: 'other',
    expected_entity: null,
    expect_identifiers: {},
    note: 'Not a document. Should be set aside, not forced into a group.',
    printed: {},
  });
  console.log(`  ✓ ${'hardware-receipt.png'.padEnd(34)} A hardware shop receipt  — should be set aside`);

  await writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const entities = new Set(FILES.map((f) => f.entity));
  console.log(`\n${manifest.files.length} files, ${entities.size} entities → public/samples/dossier\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
