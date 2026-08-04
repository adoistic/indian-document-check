#!/usr/bin/env node
/**
 * The cards that sit between the screen recordings — the opening, the moments
 * where the subject changes, and the close. Drawn as SVG and rasterised, in the
 * app's own colours so the film looks of a piece.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'build', 'slides');

const W = 1920;
const H = 1080;

const INK = '#14171c';
const DIM = '#5b6472';
const ACCENT = '#1f5fd6';
const PAPER = '#f5f6f8';
const CARD = '#ffffff';

const FONT = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const FONT_LOCAL = "'Kohinoor Devanagari', 'Devanagari Sangam MN', sans-serif";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A faint tricolour band, used sparingly. */
const ribbon = (y) => `
  <rect x="0" y="${y}" width="${W}" height="6" fill="#ef7c22"/>
  <rect x="0" y="${y + 6}" width="${W}" height="6" fill="#ffffff"/>
  <rect x="0" y="${y + 12}" width="${W}" height="6" fill="#12864f"/>`;

/** The wavy background printed on Indian certificates, very faint. */
function guilloche(opacity = 0.05) {
  let out = `<g opacity="${opacity}" stroke="${ACCENT}" fill="none" stroke-width="1.4">`;
  for (let i = 0; i < 22; i++) {
    const y = (H / 22) * i + 14;
    out += `<path d="M -40 ${y} q ${W / 4} -34 ${W / 2} 0 t ${W / 2} 0 t ${W / 2} 0"/>`;
  }
  return `${out}</g>`;
}

const page = (body, background = PAPER) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <rect width="${W}" height="${H}" fill="${background}"/>
  ${guilloche()}
  ${body}
</svg>`;

// Emoji come out as empty boxes when SVG is rasterised here, so the few icons
// the slides need are drawn instead. Each is sized to a 100×100 box at (x, y).
const icons = {
  card: (x, y, s, c) => `<g transform="translate(${x},${y}) scale(${s / 100})" fill="none" stroke="${c}" stroke-width="6" stroke-linejoin="round">
    <rect x="6" y="20" width="88" height="62" rx="8"/>
    <rect x="16" y="32" width="26" height="30" rx="4"/>
    <path d="M54 38h30M54 52h30M54 66h18" stroke-linecap="round"/>
  </g>`,

  bank: (x, y, s, c) => `<g transform="translate(${x},${y}) scale(${s / 100})" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 38 50 16l40 22"/>
    <path d="M18 38v34M38 38v34M62 38v34M82 38v34"/>
    <path d="M8 80h84"/>
  </g>`,

  house: (x, y, s, c) => `<g transform="translate(${x},${y}) scale(${s / 100})" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 46 50 16l36 30"/>
    <path d="M24 44v38h52V44"/>
    <path d="M42 82V60h16v22"/>
  </g>`,

  briefcase: (x, y, s, c) => `<g transform="translate(${x},${y}) scale(${s / 100})" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="10" y="32" width="80" height="52" rx="8"/>
    <path d="M38 32V22h24v10"/>
    <path d="M10 54h80"/>
  </g>`,

  page: (x, y, s, c) => `<g transform="translate(${x},${y}) scale(${s / 100})" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 12h32l22 22v54a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z"/>
    <path d="M56 12v24h22"/>
    <path d="M34 54h30M34 68h30"/>
  </g>`,

  wheat: (x, y, s, c) => `<g transform="translate(${x},${y}) scale(${s / 100})" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M50 88V32"/>
    <path d="M50 34c-14-4-20-14-18-24 12 0 18 8 18 18M50 34c14-4 20-14 18-24-12 0-18 8-18 18"/>
    <path d="M50 58c-14-4-20-14-18-24 12 0 18 8 18 18M50 58c14-4 20-14 18-24-12 0-18 8-18 18"/>
  </g>`,

  hospital: (x, y, s, c) => `<g transform="translate(${x},${y}) scale(${s / 100})" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="12" y="18" width="76" height="66" rx="10"/>
    <path d="M50 34v34M33 51h34"/>
  </g>`,
};

/** Big centred statement, with an optional line above and below. */
const statement = ({ eyebrow, lines, footnote, size = 78, colour = INK }) => {
  const top = H / 2 - ((lines.length - 1) * size * 1.25) / 2;
  return page(`
    ${eyebrow ? `<text x="${W / 2}" y="${top - size * 1.5}" text-anchor="middle" font-size="27" letter-spacing="5" fill="${DIM}">${esc(eyebrow.toUpperCase())}</text>` : ''}
    ${lines
      .map(
        (line, i) =>
          `<text x="${W / 2}" y="${top + i * size * 1.25}" text-anchor="middle" font-size="${size}" font-weight="640" letter-spacing="-1.6" fill="${colour}">${esc(line)}</text>`,
      )
      .join('\n    ')}
    ${footnote ? `<text x="${W / 2}" y="${top + lines.length * size * 1.25 + 46}" text-anchor="middle" font-size="34" fill="${DIM}">${esc(footnote)}</text>` : ''}`);
};

const SLIDES = {
  /** Opening card. */
  title: () =>
    page(`
    ${ribbon(0)}
    ${icons.card(W / 2 - 80, H / 2 - 260, 160, ACCENT)}
    <text x="${W / 2}" y="${H / 2 + 22}" text-anchor="middle" font-size="104" font-weight="680" letter-spacing="-3" fill="${INK}">Document Check</text>
    <text x="${W / 2}" y="${H / 2 + 92}" text-anchor="middle" font-size="40" fill="${DIM}">Does what someone typed match the document they gave you?</text>
    <text x="${W / 2}" y="${H / 2 + 168}" text-anchor="middle" font-family="${FONT_LOCAL}" font-size="34" fill="${ACCENT}">भारत सरकार के दस्तावेज़</text>
    ${ribbon(H - 18)}`),

  /** The problem, as three things a clerk actually does. */
  problem: () => {
    const items = [
      ['Squint at the card', 'Small print, glare, a folded corner'],
      ['Type it in by hand', 'Twelve digits, no second chance'],
      ['Hope it is right', 'Nobody checks the checker'],
    ];
    const cardW = 500;
    const gap = 60;
    const startX = (W - (cardW * 3 + gap * 2)) / 2;

    return page(`
      <text x="${W / 2}" y="230" text-anchor="middle" font-size="66" font-weight="640" letter-spacing="-1.4" fill="${INK}">How it is done today</text>
      ${items
        .map(([title, note], i) => {
          const x = startX + i * (cardW + gap);
          return `
        <rect x="${x}" y="380" width="${cardW}" height="300" rx="24" fill="${CARD}" stroke="#e2e5ea" stroke-width="2"/>
        <circle cx="${x + 62}" cy="452" r="26" fill="${ACCENT}"/>
        <text x="${x + 62}" y="463" text-anchor="middle" font-size="30" font-weight="700" fill="#fff">${i + 1}</text>
        <text x="${x + 40}" y="560" font-size="42" font-weight="620" fill="${INK}">${esc(title)}</text>
        <text x="${x + 40}" y="614" font-size="27" fill="${DIM}">${esc(note)}</text>`;
        })
        .join('\n      ')}
      <text x="${W / 2}" y="800" text-anchor="middle" font-size="36" fill="${DIM}">Slow, and exactly where mistakes creep in.</text>`);
  },

  /** What counts as the same, and what does not. */
  judgement: () => {
    const rows = [
      ['Priya V.', 'Priya Venkatesan', true],
      ['Sandip Joshi', 'Sandeep Joshi', true],
      ['Sunrise Apts, Andheri E', 'Sunrise Apartments, Andheri East', true],
      ['03 January 1990', '03 January 1992', false],
    ];
    return page(`
      <text x="${W / 2}" y="196" text-anchor="middle" font-size="66" font-weight="640" letter-spacing="-1.4" fill="${INK}">Not every difference is a problem</text>
      ${rows
        .map(([left, right, same], i) => {
          const y = 320 + i * 148;
          const tint = same ? '#15774f' : '#b83228';
          const wash = same ? '#e3f4ec' : '#fce9e7';
          return `
        <rect x="240" y="${y}" width="1440" height="112" rx="18" fill="${wash}"/>
        <text x="290" y="${y + 70}" font-size="38" fill="${INK}">${esc(left)}</text>
        <text x="${W / 2}" y="${y + 70}" text-anchor="middle" font-size="34" fill="${tint}">${same ? '=' : '≠'}</text>
        <text x="1630" y="${y + 70}" text-anchor="end" font-size="38" fill="${INK}">${esc(right)}</text>
        <text x="${W / 2}" y="${y + 70}" text-anchor="middle" font-size="0">.</text>`;
        })
        .join('\n      ')}
      <text x="${W / 2}" y="960" text-anchor="middle" font-size="34" fill="${DIM}">Same person, written differently — or a different person altogether.</text>`);
  },

  /** Turning point into the second half. */
  pile: () =>
    statement({
      eyebrow: 'And then there is real life',
      lines: ['Nobody hands you', 'one tidy document.'],
      size: 92,
    }),

  /** The same-name trap. */
  twins: () =>
    page(`
      <text x="${W / 2}" y="200" text-anchor="middle" font-size="62" font-weight="640" letter-spacing="-1.4" fill="${INK}">Two men. The same name, letter for letter.</text>
      ${[
        ['Sandeep Joshi', 'Born 9 September 1985', 'Vasant Vihar Colony, Bhopal', 'Six documents', ACCENT],
        ['Sandeep Joshi', 'Born 24 February 1971', 'Kasturba Road, Jabalpur', 'One document', '#8a5a05'],
      ]
        .map(([name, dob, where, docs, tint], i) => {
          const x = 200 + i * 800;
          return `
        <rect x="${x}" y="300" width="720" height="420" rx="26" fill="${CARD}" stroke="#e2e5ea" stroke-width="2"/>
        <rect x="${x}" y="300" width="10" height="420" rx="5" fill="${tint}"/>
        <text x="${x + 56}" y="392" font-size="52" font-weight="660" fill="${INK}">${esc(name)}</text>
        <text x="${x + 56}" y="470" font-size="31" fill="${DIM}">${esc(dob)}</text>
        <text x="${x + 56}" y="524" font-size="31" fill="${DIM}">${esc(where)}</text>
        <text x="${x + 56}" y="640" font-size="31" fill="${tint}">${esc(docs)}</text>`;
        })
        .join('\n      ')}
      <text x="${W / 2}" y="856" text-anchor="middle" font-size="44" font-weight="600" fill="${INK}">Kept apart. A name on its own is never enough.</text>`),

  /** Where it gets used. */
  uses: () => {
    const uses = [
      ['bank', 'Opening a bank account'],
      ['house', 'Renting a flat'],
      ['briefcase', 'Taking on an employee'],
      ['page', 'A loan file'],
      ['wheat', 'A government scheme'],
      ['hospital', 'Admitting a patient'],
    ];
    const cardW = 520;
    const cardH = 200;
    const gapX = 50;
    const gapY = 44;
    const startX = (W - (cardW * 3 + gapX * 2)) / 2;

    return page(`
      <text x="${W / 2}" y="252" text-anchor="middle" font-size="66" font-weight="640" letter-spacing="-1.4" fill="${INK}">Wherever paper has to become a decision</text>
      ${uses
        .map(([icon, label], i) => {
          const x = startX + (i % 3) * (cardW + gapX);
          const y = 388 + Math.floor(i / 3) * (cardH + gapY);
          return `
        <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="22" fill="${CARD}" stroke="#e2e5ea" stroke-width="2"/>
        ${icons[icon](x + 46, y + 52, 96, ACCENT)}
        <text x="${x + 168}" y="${y + 116}" font-size="35" font-weight="580" fill="${INK}">${esc(label)}</text>`;
        })
        .join('\n      ')}`);
  },

  /** Closing card. */
  close: () =>
    page(`
      ${ribbon(0)}
      <text x="${W / 2}" y="330" text-anchor="middle" font-size="80" font-weight="660" letter-spacing="-2" fill="${INK}">Less typing.</text>
      <text x="${W / 2}" y="450" text-anchor="middle" font-size="80" font-weight="660" letter-spacing="-2" fill="${INK}">Far fewer mistakes.</text>
      <text x="${W / 2}" y="570" text-anchor="middle" font-size="80" font-weight="660" letter-spacing="-2" fill="${ACCENT}">A second pair of eyes.</text>
      <text x="${W / 2}" y="700" text-anchor="middle" font-size="36" fill="${DIM}">Fifteen Indian documents. Read, checked, and sorted into who they belong to.</text>
      ${icons.card(W / 2 - 200, 810, 74, INK)}
      <text x="${W / 2} " y="866" text-anchor="middle" font-size="46" font-weight="620" fill="${INK}">Document Check</text>
      <text x="${W / 2}" y="924" text-anchor="middle" font-size="29" fill="${DIM}">Every document shown here is invented. A demonstration, not an identity service.</text>
      ${ribbon(H - 18)}`),
};

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const [name, draw] of Object.entries(SLIDES)) {
    const file = path.join(OUT, `${name}.png`);
    await sharp(Buffer.from(draw())).png({ compressionLevel: 9 }).toFile(file);
    console.log(`  · ${name}.png`);
  }

  console.log(`\n${Object.keys(SLIDES).length} slides → video/build/slides\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export { SLIDES };
