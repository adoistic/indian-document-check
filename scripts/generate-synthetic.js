#!/usr/bin/env node
/**
 * Draws a synthetic sample of every supported document, and pairs each one with
 * form data designed to produce a known answer.
 *
 *   npm run samples
 *
 * Everything here is invented — the people, the businesses, the numbers and the
 * addresses. ID numbers are built to pass their own format checks so the local
 * validation is exercised, which makes them well-formed, not issued. Every page
 * is stamped as a specimen.
 *
 * Output goes to public/samples so both the local server and the deployed site
 * serve the same files.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { DOCUMENTS, getDocument } from '../public/lib/documents.js';
import { gstinCheckChar, verhoeffCheckDigit } from '../public/lib/validators.js';
import { renderDocument } from './render/templates.js';
import { jpegToPdf } from './lib/jpeg-to-pdf.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples');

// Seeded so regenerating produces byte-identical fixtures.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260805);

const pick = (list) => list[Math.floor(rand() * list.length)];
const digits = (n) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join('');
const letters = (n) => Array.from({ length: n }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(rand() * 26)]).join('');

// ── Well-formed but entirely fictitious numbers ───────────────────────────

function aadhaarNumber() {
  const base = String(2 + Math.floor(rand() * 8)) + digits(10);
  const full = base + verhoeffCheckDigit(base);
  return `${full.slice(0, 4)} ${full.slice(4, 8)} ${full.slice(8)}`;
}

/** PAN: 4th character P for an individual, 5th the first letter of the surname. */
function panNumber(surname, holderType = 'P') {
  return `${letters(3)}${holderType}${surname[0].toUpperCase()}${digits(4)}${letters(1)}`;
}

const licenceNumber = (state, rto, year) => `${state}${String(rto).padStart(2, '0')} ${year}${digits(7)}`;
const passportNumber = () => `${letters(1)}${1 + Math.floor(rand() * 9)}${digits(5)}${1 + Math.floor(rand() * 9)}`;
const epicNumber = () => `${letters(3)}${digits(7)}`;
const rcNumber = (state, rto) => `${state}${String(rto).padStart(2, '0')}${letters(2)}${digits(4)}`;

function gstin(stateCode, pan) {
  const first14 = `${stateCode}${pan}1Z`;
  return first14 + gstinCheckChar(first14);
}

const udyamNumber = (state) => `UDYAM-${state}-${digits(2)}-${digits(7)}`;
const abhaNumber = () => {
  const d = digits(14);
  return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}-${d.slice(10)}`;
};
const jobCardNumber = (state) => `${state}-${digits(2)}-${digits(3)}-${digits(3)}-${digits(3)}/${digits(3)}`;

// ── The people and businesses on the samples ──────────────────────────────

const PEOPLE = {
  rajesh: {
    name: 'Rajesh Kumar Sharma',
    surname: 'Sharma',
    given: 'Rajesh Kumar',
    father: 'Mahesh Chand Sharma',
    mother: 'Kamla Devi Sharma',
    dob: '1988-04-17',
    gender: 'Male',
    address: 'H.No 42, Gandhi Nagar, Sector 9, Rohini, New Delhi, Delhi - 110085',
    city: 'New Delhi',
    state: 'DL',
  },
  priya: {
    name: 'Priya Venkatesan',
    surname: 'Venkatesan',
    given: 'Priya',
    father: 'S Venkatesan',
    mother: 'Meenakshi Venkatesan',
    dob: '1995-11-02',
    gender: 'Female',
    address: '18/3 Bharathi Street, Adambakkam, Chennai, Tamil Nadu - 600088',
    city: 'Chennai',
    state: 'TN',
  },
  arif: {
    name: 'Mohammed Arif Ansari',
    surname: 'Ansari',
    given: 'Mohammed Arif',
    father: 'Abdul Rahim Ansari',
    mother: 'Shabana Ansari',
    dob: '1979-01-30',
    gender: 'Male',
    address: 'Flat 604, Sunrise Apartments, Andheri East, Mumbai, Maharashtra - 400069',
    city: 'Mumbai',
    state: 'MH',
  },
  lakshmi: {
    name: 'Lakshmi Devi Reddy',
    surname: 'Reddy',
    given: 'Lakshmi Devi',
    father: 'K Narasimha Reddy',
    mother: 'Padmavathi Reddy',
    dob: '1992-07-25',
    gender: 'Female',
    address: '7-1-58/2 Ameerpet Main Road, Hyderabad, Telangana - 500016',
    city: 'Hyderabad',
    state: 'TG',
  },
  sandeep: {
    name: 'Sandeep Joshi',
    surname: 'Joshi',
    given: 'Sandeep',
    father: 'Ramesh Joshi',
    mother: 'Sunita Joshi',
    dob: '1985-09-09',
    gender: 'Male',
    address: 'Plot 12, Vasant Vihar Colony, Bhopal, Madhya Pradesh - 462003',
    city: 'Bhopal',
    state: 'MP',
  },
  kavita: {
    name: 'Kavita Bai Meena',
    surname: 'Meena',
    given: 'Kavita Bai',
    father: 'Ramlal Meena',
    mother: 'Sushila Meena',
    dob: '1983-03-12',
    gender: 'Female',
    address: 'Ward 4, Village Bagdi, Tehsil Malpura, Tonk, Rajasthan - 304502',
    city: 'Tonk',
    state: 'RJ',
  },
};

/** The printed value for each document, built from a person or a business. */
const CARD_VALUES = {
  aadhaar: (p) => ({
    name: p.name,
    date_of_birth: p.dob,
    gender: p.gender,
    address: p.address,
    aadhaar_number: aadhaarNumber(),
    guardian_name: p.father,
  }),

  pan: (p) => ({
    name: p.name,
    father_name: p.father,
    date_of_birth: p.dob,
    pan_number: panNumber(p.surname),
  }),

  driving_licence: (p) => ({
    name: p.name,
    guardian_name: p.father,
    date_of_birth: p.dob,
    address: p.address,
    licence_number: licenceNumber(p.state, 2 + Math.floor(rand() * 40), 2011 + Math.floor(rand() * 10)),
    blood_group: pick(['A+', 'B+', 'O+', 'AB+', 'O-']),
    valid_till: '2031-12-31',
    vehicle_classes: pick(['LMV', 'LMV, MCWG', 'MCWG']),
  }),

  passport: (p) => ({
    surname: p.surname,
    given_name: p.given,
    date_of_birth: p.dob,
    gender: p.gender,
    place_of_birth: p.city,
    passport_number: passportNumber(),
    date_of_issue: '2019-06-14',
    date_of_expiry: '2029-06-13',
  }),

  voter_id: (p) => ({
    name: p.name,
    guardian_name: p.father,
    gender: p.gender,
    date_of_birth: p.dob,
    address: p.address,
    epic_number: epicNumber(),
  }),

  vehicle_rc: (p) => ({
    owner_name: p.name,
    address: p.address,
    registration_number: rcNumber(p.state, 1 + Math.floor(rand() * 40)),
    make_model: pick(['Maruti Suzuki Swift VXi', 'Hyundai i20 Sportz', 'Tata Nexon XM', 'Honda Activa 6G']),
    chassis_number: `MA3${letters(3)}${digits(11)}`,
    engine_number: `${letters(3)}${digits(9)}`,
    fuel_type: pick(['Petrol', 'Diesel', 'CNG']),
    registration_date: '2021-08-19',
  }),

  ration_card: (p) => ({
    head_of_family: p.name,
    card_number: `${p.state}-2019-${digits(10)}`,
    category: pick(['Antyodaya (AAY)', 'Priority household (PHH)', 'Above poverty line (APL)']),
    address: p.address,
    member_count: String(3 + Math.floor(rand() * 4)),
    fps_name: `FPS ${pick(['Shivaji Nagar', 'Ward 7', 'Gandhi Chowk', 'Nehru Market'])}`,
  }),

  birth_certificate: (p) => ({
    name: p.name,
    date_of_birth: p.dob,
    place_of_birth: `${pick(['Civil Hospital', 'District Hospital', 'Sanjeevani Nursing Home'])}, ${p.city}`,
    gender: p.gender,
    father_name: p.father,
    mother_name: p.mother,
    registration_number: `BRN/${p.dob.slice(0, 4)}/${p.state}/${digits(7)}`,
    date_of_registration: `${p.dob.slice(0, 4)}-${p.dob.slice(5, 7)}-28`,
  }),

  gst_certificate: (p) => {
    const pan = panNumber(p.surname, 'P');
    const stateCode = { DL: '07', TN: '33', MH: '27', TG: '36', MP: '23', RJ: '08' }[p.state] ?? '27';
    return {
      legal_name: `${p.surname} Traders`,
      trade_name: `${p.surname} Electricals`,
      gstin: gstin(stateCode, pan),
      address: p.address,
      constitution: 'Proprietorship',
      registration_date: '2020-04-01',
    };
  },

  udyam: (p) => ({
    enterprise_name: `${p.surname} Engineering Works`,
    udyam_number: udyamNumber(p.state),
    owner_name: p.name,
    enterprise_type: pick(['Micro', 'Small']),
    address: p.address,
    commencement_date: '2018-02-15',
  }),

  nrega_job_card: (p) => ({
    name: p.name,
    job_card_number: jobCardNumber(p.state),
    guardian_name: p.father,
    village: pick(['Bagdi', 'Sultanpura', 'Rampura', 'Kheri Kalan']),
    panchayat: pick(['Malpura', 'Dooni', 'Nagarfort']),
    district: pick(['Tonk', 'Bhilwara', 'Ajmer']),
    state: 'Rajasthan',
    category: pick(['General', 'OBC', 'SC', 'ST']),
  }),

  abha: (p) => ({
    name: p.name,
    abha_number: abhaNumber(),
    date_of_birth: p.dob,
    gender: p.gender,
    abha_address: `${p.given.split(' ')[0].toLowerCase()}${digits(2)}@abdm`,
    address: p.address,
  }),
};

/** Who appears on which document. */
const CAST = {
  aadhaar: PEOPLE.rajesh,
  pan: PEOPLE.priya,
  driving_licence: PEOPLE.arif,
  passport: PEOPLE.lakshmi,
  voter_id: PEOPLE.sandeep,
  vehicle_rc: PEOPLE.arif,
  ration_card: PEOPLE.kavita,
  birth_certificate: PEOPLE.priya,
  gst_certificate: PEOPLE.sandeep,
  udyam: PEOPLE.rajesh,
  nrega_job_card: PEOPLE.kavita,
  abha: PEOPLE.lakshmi,
};

/**
 * The second sample for each document: a realistic slip, and what it should
 * come out as. `change` receives the printed values and returns overrides.
 */
const SLIPS = {
  aadhaar: {
    label: 'One digit of the Aadhaar number typed wrongly',
    expected: 'mismatch',
    change: (v) => ({ aadhaar_number: bumpDigit(v.aadhaar_number) }),
  },
  pan: {
    label: 'Date of birth out by a year',
    expected: 'mismatch',
    change: (v) => ({ date_of_birth: shiftYear(v.date_of_birth, 1) }),
  },
  driving_licence: {
    label: 'Address abbreviated — the same place, written shorter',
    expected: 'match',
    change: () => ({ address: 'Sunrise Apts, Flat 604, Andheri E, Mumbai 400069' }),
  },
  passport: {
    label: 'A different person entirely',
    expected: 'mismatch',
    change: () => ({ surname: 'Iyer', given_name: 'Ananya', date_of_birth: '1994-02-11' }),
  },
  voter_id: {
    label: 'Name spelt the other common way (Sandip, not Sandeep)',
    expected: 'partial_match',
    change: (v) => ({ name: v.name.replace('Sandeep', 'Sandip') }),
  },
  vehicle_rc: {
    label: 'Registration number off by one character',
    expected: 'mismatch',
    change: (v) => ({ registration_number: bumpDigit(v.registration_number) }),
  },
  ration_card: {
    label: 'Card type recorded as the wrong category',
    expected: 'mismatch',
    change: (v) => ({ category: v.category.startsWith('Antyodaya') ? 'Above poverty line (APL)' : 'Antyodaya (AAY)' }),
  },
  birth_certificate: {
    label: 'Registration date out by a few days',
    expected: 'partial_match',
    change: (v) => ({ date_of_registration: `${v.date_of_registration.slice(0, 8)}22` }),
  },
  gst_certificate: {
    label: 'Trading name typed where the legal name was asked for',
    expected: 'mismatch',
    change: (v) => ({ legal_name: v.trade_name }),
  },
  udyam: {
    label: 'Size band typed as Medium when the certificate says otherwise',
    expected: 'partial_match',
    change: () => ({ enterprise_type: 'Medium' }),
  },
  nrega_job_card: {
    label: 'Wrong village recorded',
    expected: 'partial_match',
    change: () => ({ village: 'Chandpura' }),
  },
  abha: {
    label: 'Everything right, ABHA address left blank',
    expected: 'match',
    change: () => ({ abha_address: '' }),
  },
};

/** Change one digit so a number stays well-formed but stops matching. */
function bumpDigit(value) {
  const chars = String(value).split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    if (/\d/.test(chars[i])) {
      chars[i] = String((Number(chars[i]) + 4) % 10);
      break;
    }
  }
  return chars.join('');
}

const shiftYear = (iso, by) => `${Number(iso.slice(0, 4)) + by}${iso.slice(4)}`;

/** A shop receipt, so there is something that is plainly not a government document. */
function receiptSvg() {
  const items = [
    ['Toor Dal 1kg', '182.00'],
    ['Mustard Oil 1L', '164.50'],
    ['Basmati Rice 5kg', '640.00'],
    ['Tea Powder 500g', '245.00'],
    ['Detergent Bar x3', '96.00'],
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="700" viewBox="0 0 620 700" font-family="-apple-system, Helvetica, Arial, sans-serif">
  <rect width="620" height="700" fill="#efece6"/>
  <rect x="90" y="40" width="440" height="620" fill="#fff" stroke="#ddd"/>
  <text x="310" y="100" text-anchor="middle" font-size="26" font-weight="700">SHREE GANESH STORES</text>
  <text x="310" y="130" text-anchor="middle" font-size="15" fill="#666">Ashok Nagar, Pune 411007</text>
  <line x1="130" y1="160" x2="490" y2="160" stroke="#bbb" stroke-dasharray="4 4"/>
  ${items
    .map(([item, price], i) =>
      `<text x="140" y="${200 + i * 36}" font-size="18">${item}</text><text x="480" y="${200 + i * 36}" font-size="18" text-anchor="end">${price}</text>`)
    .join('\n  ')}
  <line x1="130" y1="400" x2="490" y2="400" stroke="#bbb" stroke-dasharray="4 4"/>
  <text x="140" y="436" font-size="20" font-weight="700">TOTAL</text>
  <text x="480" y="436" font-size="20" font-weight="700" text-anchor="end">1327.50</text>
  <text x="310" y="500" text-anchor="middle" font-size="15" fill="#666">Thank you — visit again</text>
  <text x="310" y="640" text-anchor="middle" font-size="13" fill="#999">SYNTHETIC SPECIMEN — SAMPLE DATA</text>
</svg>`;
}

// ── Build ─────────────────────────────────────────────────────────────────

async function writePng(svg, file) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(OUT, file));
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const manifest = {
    note: 'Every person, business, address and number below is invented.',
    documents: {},
    cases: [],
  };

  let seed = 101;

  for (const doc of DOCUMENTS) {
    const person = CAST[doc.id];
    const printed = CARD_VALUES[doc.id](person);
    const image = `${doc.id}.png`;

    await writePng(renderDocument(doc, printed, (seed += 17)), image);

    manifest.documents[doc.id] = { image, printed };

    manifest.cases.push({
      id: `${doc.id}-match`,
      document: doc.id,
      label: 'Details typed exactly as printed',
      expected_verdict: 'match',
      image,
      submission: { ...printed },
    });

    const slip = SLIPS[doc.id];
    if (slip) {
      manifest.cases.push({
        id: `${doc.id}-slip`,
        document: doc.id,
        label: slip.label,
        expected_verdict: slip.expected,
        image,
        submission: { ...printed, ...slip.change(printed) },
      });
    }

    console.log(`  ✓ ${image.padEnd(28)} ${doc.name}`);
  }

  // Two documents that should not be accepted at all.
  await writePng(receiptSvg(), 'not-a-document.png');
  manifest.cases.push({
    id: 'wrong-file-receipt',
    document: 'aadhaar',
    label: 'A shop receipt uploaded instead of an Aadhaar card',
    expected_verdict: 'wrong_document',
    image: 'not-a-document.png',
    submission: { ...manifest.documents.aadhaar.printed },
  });

  manifest.cases.push({
    id: 'wrong-document-pan-for-aadhaar',
    document: 'aadhaar',
    label: 'A PAN card handed over when an Aadhaar card was asked for',
    expected_verdict: 'wrong_document',
    image: manifest.documents.pan.image,
    submission: { ...manifest.documents.aadhaar.printed },
  });
  console.log(`  ✓ ${'not-a-document.png'.padEnd(28)} A shop receipt`);

  // One PDF, so the "upload the PDF you downloaded" path has a fixture.
  const aadhaar = getDocument('aadhaar');
  const jpeg = await sharp(Buffer.from(renderDocument(aadhaar, manifest.documents.aadhaar.printed, 118)))
    .jpeg({ quality: 90 })
    .toBuffer();
  const { width, height } = await sharp(jpeg).metadata();
  await writeFile(path.join(OUT, 'aadhaar.pdf'), jpegToPdf(jpeg, width, height));
  manifest.documents.aadhaar.pdf = 'aadhaar.pdf';
  console.log(`  ✓ ${'aadhaar.pdf'.padEnd(28)} The same card as a PDF`);

  await writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n${DOCUMENTS.length} documents, ${manifest.cases.length} test cases → public/samples\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
