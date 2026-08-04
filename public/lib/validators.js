// Format checks for Indian government document numbers.
//
// These run locally, in the browser and on the server, with no network call and
// no model involved. They can only tell you a number is *structurally* wrong —
// a number that passes is well-formed, not necessarily issued to anyone.

// ── Aadhaar: 12 digits, Verhoeff check digit, never starts 0 or 1 ──────────

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

function verhoeffChecksum(digits) {
  let c = 0;
  const reversed = digits.split('').reverse();
  for (let i = 0; i < reversed.length; i++) c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(reversed[i])]];
  return c;
}

export function verhoeffCheckDigit(elevenDigits) {
  return VERHOEFF_INV[verhoeffChecksum(`${elevenDigits}0`)];
}

export const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');
export const upperAlnum = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** "123412341234" → "1234 1234 1234" */
export function groupDigits(value, size = 4) {
  const d = digitsOnly(value);
  return d.replace(new RegExp(`(.{${size}})(?=.)`, 'g'), '$1 ');
}

// ── GSTIN: Luhn mod 36 over the first 14 characters ───────────────────────

const GST_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < first14.length; i++) {
    const value = GST_ALPHABET.indexOf(first14[i]);
    if (value < 0) return null;
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GST_ALPHABET[(36 - (sum % 36)) % 36];
}

// Characters 13-15 of a company number say what kind of company it is.
const COMPANY_TYPES = {
  PLC: 'a public limited company',
  PTC: 'a private limited company',
  OPC: 'a one-person company',
  FTC: 'a subsidiary of a foreign company',
  GAP: 'a government company',
  SGC: 'a state government company',
  NPL: 'a not-for-profit company',
  ULL: 'an unlimited liability company',
  ULT: 'an unlimited liability public company',
  GAT: 'a general association',
};

// PAN's 4th character encodes the kind of taxpayer. P is an individual.
const PAN_HOLDER_TYPES = {
  A: 'an association of persons',
  B: 'a body of individuals',
  C: 'a company',
  F: 'a firm',
  G: 'a government body',
  H: 'a Hindu undivided family',
  J: 'an artificial juridical person',
  L: 'a local authority',
  P: 'an individual',
  T: 'a trust',
};

/**
 * Each entry returns { ok, message } — `message` is written for someone with no
 * idea what a checksum is, because it is shown directly in the interface.
 */
export const NUMBER_CHECKS = {
  aadhaar_number(value) {
    const d = digitsOnly(value);
    if (d.length !== 12) return { ok: false, message: `An Aadhaar number has 12 digits. This one has ${d.length}.` };
    if (d[0] === '0' || d[0] === '1') return { ok: false, message: 'No Aadhaar number starts with 0 or 1.' };
    if (verhoeffChecksum(d) !== 0) return { ok: false, message: 'This is not a real Aadhaar number — the built-in check digit does not add up.' };
    return { ok: true, message: 'The Aadhaar number is in the right shape and its check digit adds up.' };
  },

  pan_number(value) {
    const p = upperAlnum(value);
    if (p.length !== 10) return { ok: false, message: `A PAN has 10 characters. This one has ${p.length}.` };
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p)) return { ok: false, message: 'A PAN looks like ABCDE1234F — five letters, four digits, one letter.' };
    const holder = PAN_HOLDER_TYPES[p[3]];
    if (!holder) return { ok: false, message: `The 4th character says what kind of taxpayer this is, and "${p[3]}" is not one of them.` };
    return { ok: true, message: `The PAN is in the right shape. Its 4th character says it belongs to ${holder}.` };
  },

  licence_number(value) {
    const l = upperAlnum(value);
    if (!/^[A-Z]{2}\d{13}$/.test(l)) {
      return { ok: false, message: 'A driving licence number looks like MH12 20110012345 — two letters for the state, then 13 digits.' };
    }
    const year = Number(l.slice(4, 8));
    const thisYear = new Date().getFullYear();
    if (year < 1950 || year > thisYear) return { ok: false, message: `The licence number says it was issued in ${year}, which cannot be right.` };
    return { ok: true, message: `The licence number is in the right shape: ${l.slice(0, 2)} state office, issued ${year}.` };
  },

  passport_number(value) {
    const p = upperAlnum(value);
    if (!/^[A-Z][1-9]\d{5}[1-9]$/.test(p)) {
      return { ok: false, message: 'An Indian passport number looks like M1234567 — one letter followed by seven digits.' };
    }
    return { ok: true, message: 'The passport number is in the right shape.' };
  },

  epic_number(value) {
    const e = upperAlnum(value);
    if (!/^[A-Z]{3}\d{7}$/.test(e)) {
      return { ok: false, message: 'A voter ID number looks like ABC1234567 — three letters followed by seven digits.' };
    }
    return { ok: true, message: 'The voter ID number is in the right shape.' };
  },

  registration_number(value) {
    const r = upperAlnum(value);
    if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(r)) {
      return { ok: false, message: 'A registration number looks like MH12AB1234 — state, district, series, then the number.' };
    }
    return { ok: true, message: `The registration number is in the right shape and was issued in ${r.slice(0, 2)}.` };
  },

  gstin(value) {
    const g = upperAlnum(value);
    if (g.length !== 15) return { ok: false, message: `A GST number has 15 characters. This one has ${g.length}.` };
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(g)) {
      return { ok: false, message: 'A GST number is a two-digit state code, then a PAN, then a digit, then Z, then one check character.' };
    }
    const state = Number(g.slice(0, 2));
    if (state < 1 || state > 38) return { ok: false, message: `"${g.slice(0, 2)}" is not a state code used on GST numbers.` };
    const expected = gstinCheckChar(g.slice(0, 14));
    if (expected && expected !== g[14]) {
      return { ok: false, message: 'This is not a real GST number — the final check character does not add up.' };
    }
    return { ok: true, message: 'The GST number is in the right shape and its check character adds up.' };
  },

  din(value) {
    const d = digitsOnly(value);
    if (d.length !== 8) return { ok: false, message: `A director's ID number has 8 digits. This one has ${d.length}.` };
    return { ok: true, message: 'The director ID number is in the right shape.' };
  },

  cin(value) {
    const c = upperAlnum(value);
    if (c.length !== 21) return { ok: false, message: `A company number has 21 characters. This one has ${c.length}.` };
    if (!/^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/.test(c)) {
      return { ok: false, message: 'A company number looks like U72200KA2013PTC098765 — listed or unlisted, industry, state, year, company type, then the registration number.' };
    }
    const year = Number(c.slice(8, 12));
    const thisYear = new Date().getFullYear();
    if (year < 1850 || year > thisYear) return { ok: false, message: `The company number says the company was incorporated in ${year}, which cannot be right.` };

    const listed = c[0] === 'L' ? 'listed on a stock exchange' : 'not listed on a stock exchange';
    const kind = COMPANY_TYPES[c.slice(12, 15)];
    const trailer = kind ? `, and is ${kind}` : '';
    return { ok: true, message: `The company number is in the right shape: registered in ${c.slice(6, 8)} in ${year}, ${listed}${trailer}.` };
  },

  ifsc(value) {
    const i = upperAlnum(value);
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(i)) {
      return { ok: false, message: 'A bank branch code looks like HDFC0001234 — four letters for the bank, a zero, then six characters for the branch.' };
    }
    return { ok: true, message: `The branch code is in the right shape. The bank is ${i.slice(0, 4)}.` };
  },

  udyam_number(value) {
    const u = String(value ?? '').toUpperCase().replace(/\s/g, '');
    if (!/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(u)) {
      return { ok: false, message: 'A Udyam number looks like UDYAM-MH-33-0012345.' };
    }
    return { ok: true, message: 'The Udyam number is in the right shape.' };
  },

  abha_number(value) {
    const d = digitsOnly(value);
    if (d.length !== 14) return { ok: false, message: `An ABHA number has 14 digits. This one has ${d.length}.` };
    return { ok: true, message: 'The ABHA number is in the right shape.' };
  },

  job_card_number(value) {
    const j = String(value ?? '').toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z]{2}-\d{2}-\d{3}-\d{3}-\d{3}\/\d+$/.test(j)) {
      return { ok: false, message: 'A job card number looks like RJ-02-004-011-001/123.' };
    }
    return { ok: true, message: 'The job card number is in the right shape.' };
  },
};

/** Formatters used as the user types, so numbers land in their familiar shape. */
export const NUMBER_FORMATTERS = {
  aadhaar_number: (v) => groupDigits(String(v ?? '').replace(/\D/g, '').slice(0, 12)),
  pan_number: (v) => upperAlnum(v).slice(0, 10),
  passport_number: (v) => upperAlnum(v).slice(0, 8),
  epic_number: (v) => upperAlnum(v).slice(0, 10),
  gstin: (v) => upperAlnum(v).slice(0, 15),
  cin: (v) => upperAlnum(v).slice(0, 21),
  din: (v) => digitsOnly(v).slice(0, 8),
  ifsc: (v) => upperAlnum(v).slice(0, 11),
  registration_number: (v) => upperAlnum(v).slice(0, 11),
  abha_number: (v) => digitsOnly(v).slice(0, 14).replace(/^(\d{2})(\d{4})?(\d{4})?(\d{0,4})?$/, (_, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join('-')),
};

/** Runs whichever check applies to a field. Returns null when there is none. */
export function checkNumber(fieldKey, value) {
  if (!value || !String(value).trim()) return null;
  const check = NUMBER_CHECKS[fieldKey];
  return check ? check(value) : null;
}

/** Is this date real, in the past, and not absurdly far back? */
export function checkDate(value, { label = 'date', mustBePast = false, mustBeFuture = false } = {}) {
  if (!value || !String(value).trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { ok: false, message: `The ${label} could not be read as a date.` };

  const now = new Date();
  const years = (now - parsed) / (365.2425 * 24 * 3600 * 1000);

  if (mustBePast && years < 0) return { ok: false, message: `The ${label} is in the future.` };
  if (mustBeFuture && years > 0) return { ok: false, message: `The ${label} has already passed.` };
  if (years > 130) return { ok: false, message: `The ${label} is more than 130 years ago.` };
  if (label === 'date of birth' && years >= 0) {
    return { ok: true, message: `The date of birth works out to about ${Math.floor(years)} years old.` };
  }
  return { ok: true, message: `The ${label} looks sensible.` };
}
