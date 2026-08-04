// Aadhaar numbers are 12 digits whose last digit is a Verhoeff checksum over the
// preceding 11. The first digit is never 0 or 1. We use this both to validate what
// a user typed and to mint plausible synthetic numbers for the test fixtures.

const D = [
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

const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** Strip spaces, hyphens and any other separator. */
export function normalizeAadhaar(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/** "123412341234" -> "1234 1234 1234" */
export function formatAadhaar(value) {
  const d = normalizeAadhaar(value);
  return d.length === 12 ? `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}` : d;
}

/** Verhoeff checksum over a digit string. 0 means the string is self-consistent. */
function verhoeffChecksum(digits) {
  let c = 0;
  const reversed = digits.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = D[c][P[i % 8][Number(reversed[i])]];
  }
  return c;
}

/**
 * Structural validity only — this says nothing about whether UIDAI actually
 * issued the number. It just catches typos and obviously made-up digits.
 */
export function isValidAadhaar(value) {
  const d = normalizeAadhaar(value);
  if (d.length !== 12) return false;
  if (d[0] === '0' || d[0] === '1') return false;
  return verhoeffChecksum(d) === 0;
}

/** Append the Verhoeff check digit to an 11-digit string. */
export function withCheckDigit(elevenDigits) {
  const c = verhoeffChecksum(`${elevenDigits}0`);
  return elevenDigits + INV[c];
}

/** Generate a structurally valid, entirely fictitious Aadhaar number. */
export function generateAadhaar(rand = Math.random) {
  let base = String(2 + Math.floor(rand() * 8)); // first digit 2-9
  for (let i = 0; i < 10; i++) base += String(Math.floor(rand() * 10));
  return withCheckDigit(base);
}
