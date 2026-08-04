// Draws synthetic Indian documents as SVG, which sharp then rasterises.
//
// Three templates cover all twelve documents: a plastic ID card, a passport
// details page, and a printed certificate. Layout comes from each document's
// `render` block in public/lib/documents.js.
//
// Everything drawn here is invented. Each page carries a specimen mark.

const FONT = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const FONT_LOCAL = "'Kohinoor Devanagari', 'Devanagari Sangam MN', 'Noto Sans Devanagari', sans-serif";
const MONO = "'SF Mono', Menlo, 'DejaVu Sans Mono', monospace";

export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Greedy word wrap. */
export function wrap(value, maxChars) {
  const words = String(value ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxChars) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** Documents print DD/MM/YYYY. Year-only values stay as they are. */
export function printedDate(value) {
  const v = String(value ?? '');
  if (/^\d{4}$/.test(v)) return v;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

function seeded(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Reusable pieces ───────────────────────────────────────────────────────

function photo(x, y, w, h) {
  const cx = x + w / 2;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e6e9ed" stroke="#b9c0c8"/>
    <circle cx="${cx}" cy="${y + h * 0.33}" r="${w * 0.23}" fill="#98a2ae"/>
    <path d="M ${cx - w * 0.36} ${y + h} a ${w * 0.36} ${h * 0.36} 0 0 1 ${w * 0.72} 0 Z" fill="#98a2ae"/>`;
}

function qr(x, y, size, seed) {
  const cells = 12;
  const c = size / cells;
  const rand = seeded(seed);
  let out = `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fff" stroke="#222"/>`;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const corner = (i < 3 && j < 3) || (i < 3 && j > cells - 4) || (i > cells - 4 && j < 3);
      if (corner || rand() > 0.55) out += `<rect x="${x + j * c}" y="${y + i * c}" width="${c}" height="${c}" fill="#111"/>`;
    }
  }
  return out;
}

/** The Ashoka-lion emblem, suggested rather than copied. */
function emblem(cx, cy, r, fill = '#3a3a3a') {
  return `
    <g fill="${fill}">
      <ellipse cx="${cx}" cy="${cy + r * 0.55}" rx="${r * 0.62}" ry="${r * 0.14}"/>
      <path d="M ${cx - r * 0.44} ${cy + r * 0.5} L ${cx - r * 0.3} ${cy - r * 0.15} L ${cx + r * 0.3} ${cy - r * 0.15} L ${cx + r * 0.44} ${cy + r * 0.5} Z"/>
      <circle cx="${cx}" cy="${cy - r * 0.42}" r="${r * 0.3}"/>
      <circle cx="${cx - r * 0.34}" cy="${cy - r * 0.3}" r="${r * 0.22}"/>
      <circle cx="${cx + r * 0.34}" cy="${cy - r * 0.3}" r="${r * 0.22}"/>
      <rect x="${cx - r * 0.06}" y="${cy - r * 0.95}" width="${r * 0.12}" height="${r * 0.3}"/>
    </g>`;
}

function seal(cx, cy, r, accent, label) {
  return `
    <g opacity="0.72">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${accent}" stroke-width="2.5"/>
      <circle cx="${cx}" cy="${cy}" r="${r - 7}" fill="none" stroke="${accent}" stroke-width="1"/>
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="${accent}" letter-spacing="0.5">${esc(label)}</text>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="10" fill="${accent}">SEAL OF OFFICE</text>
      <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="9" fill="${accent}">SPECIMEN</text>
    </g>`;
}

function signature(x, y, accent) {
  return `<path d="M ${x} ${y} c 12 -16 20 12 32 -4 c 10 -14 16 16 28 2 c 8 -10 14 8 24 -6"
    fill="none" stroke="${accent}" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>`;
}

/** Faint wavy background, like the guilloche on real cards. */
function guilloche(w, h, accent, seed) {
  const rand = seeded(seed);
  let out = `<g opacity="0.06" stroke="${accent}" fill="none" stroke-width="1">`;
  for (let i = 0; i < 14; i++) {
    const y = (h / 14) * i + rand() * 8;
    out += `<path d="M 0 ${y} q ${w / 4} ${-18 - rand() * 14} ${w / 2} 0 t ${w / 2} 0"/>`;
  }
  return `${out}</g>`;
}

const specimen = (x, y, size = 13) =>
  `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" fill="#9a9a9a" letter-spacing="1.1">SYNTHETIC SPECIMEN — SAMPLE DATA, NOT A REAL DOCUMENT</text>`;

const localText = (x, y, value, size, fill = '#2a2a2a', anchor = 'start') =>
  value ? `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT_LOCAL}" font-size="${size}" fill="${fill}">${esc(value)}</text>` : '';

// ── Template 1: plastic ID card ───────────────────────────────────────────

function idCard(doc, values, labelFor, seed) {
  const r = doc.render;
  const single = Boolean(r.singlePanel);
  const W = 1000;
  const number = values[r.numberField] ?? '';

  const frontKeys = r.front?.length ? r.front : doc.fields.filter((f) => f.key !== r.numberField).map((f) => f.key);

  /** How tall the text block for these fields will be, so nothing gets clipped. */
  const contentHeight = (keys, wrapAt) =>
    keys.reduce((total, key) => {
      const value = values[key];
      if (!value) return total;
      if (key === 'name' || key === 'owner_name' || key === 'head_of_family') return total + 34;
      const field = doc.fields.find((f) => f.key === key);
      const printed = field?.type === 'date' ? printedDate(value) : value;
      return total + 24 + wrap(printed, wrapAt).length * 24 + 4;
    }, 0);

  const panelH = Math.max(
    320,
    // photo + padding, or the text, whichever is taller, plus the number band
    104 + Math.max(contentHeight(frontKeys, r.photo ? 52 : 74), contentHeight(r.back ?? [], 74), r.photo ? 160 : 0) + 82,
  );
  const H = single ? panelH + 96 : panelH * 2 + 116;

  const panel = (top, title, titleLocal, accent, fieldKeys, opts = {}) => {
    let out = `
    <rect x="28" y="${top}" width="944" height="${panelH}" rx="8" fill="#ffffff" stroke="#d3cec6"/>
    <g clip-path="inset(0 round 8px)">${guilloche(W, H, accent, seed + top)}</g>
    <rect x="28" y="${top}" width="944" height="52" rx="8" fill="${accent}"/>
    <rect x="28" y="${top + 40}" width="944" height="12" fill="${accent}"/>
    ${emblem(66, top + 26, 17, '#ffffff')}
    <text x="500" y="${top + 26}" text-anchor="middle" fill="#fff" font-size="19" font-weight="600" letter-spacing="1.1">${esc(title)}</text>
    ${localText(500, top + 45, titleLocal, 16, '#ffffff', 'middle')}`;

    const showPhoto = r.photo && opts.photo !== false;
    if (showPhoto) out += photo(56, top + 76, 138, 158);

    let y = top + 104;
    const left = showPhoto ? 222 : 56;
    const wrapAt = showPhoto ? 52 : 74;

    for (const key of fieldKeys) {
      const value = values[key];
      if (!value) continue;
      const field = doc.fields.find((f) => f.key === key);
      const printed = field?.type === 'date' ? printedDate(value) : value;
      const isName = key === 'name' || key === 'owner_name' || key === 'head_of_family';

      if (isName) {
        out += `<text x="${left}" y="${y}" font-size="27" font-weight="700" fill="#141414">${esc(printed)}</text>`;
        y += 34;
      } else {
        const lines = wrap(printed, wrapAt);
        out += `<text x="${left}" y="${y}" font-size="14" fill="#6d7480">${esc(labelFor(key))}</text>`;
        y += 20;
        for (const line of lines) {
          out += `<text x="${left}" y="${y}" font-size="19" fill="#1c1c1c">${esc(line)}</text>`;
          y += 24;
        }
        y += 4;
      }
    }

    if (opts.qr) out += qr(806, top + 84, 132, seed + 7);

    out += `
    <rect x="28" y="${top + panelH - 60}" width="944" height="60" fill="#f6f3ee"/>
    <text x="52" y="${top + panelH - 36}" font-size="13" fill="#6d7480">${esc(r.numberLabel ?? 'Number')}</text>
    <text x="52" y="${top + panelH - 12}" font-family="${MONO}" font-size="30" font-weight="700" letter-spacing="3" fill="#141414">${esc(number)}</text>`;

    if (r.tagline) out += localText(948, top + panelH - 18, r.tagline, 17, '#4a4a4a', 'end');
    return out;
  };

  let body = panel(28, r.title, r.titleLocal, r.accent, frontKeys);
  if (!single) {
    body += panel(28 + panelH + 28, r.backTitle ?? r.title, r.backTitleLocal ?? r.titleLocal, r.accentBack ?? r.accent, r.back ?? [], {
      photo: false,
      qr: true,
    });
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <rect width="${W}" height="${H}" fill="#f3f1ec"/>
  ${body}
  ${specimen(W / 2, H - 22)}
</svg>`;
}

// ── Template 2: passport details page ─────────────────────────────────────

function passportPage(doc, values, labelFor, seed) {
  const W = 1000;
  const H = 700;
  const accent = doc.render.accent;
  const surname = String(values.surname ?? '').toUpperCase();
  const given = String(values.given_name ?? '').toUpperCase();

  const mrzName = `${surname}<<${given.replace(/\s+/g, '<')}`.padEnd(39, '<').slice(0, 39);
  const dob = String(values.date_of_birth ?? '').replace(/-/g, '').slice(2);
  const exp = String(values.date_of_expiry ?? '').replace(/-/g, '').slice(2);
  const sex = String(values.gender ?? 'M')[0].toUpperCase();
  const mrz1 = `P<IND${mrzName}`;
  const mrz2 = `${String(values.passport_number ?? '').padEnd(9, '<')}4IND${dob}0${sex}${exp}4<<<<<<<<<<<<<<02`.slice(0, 44);

  const rows = [
    ['Type / प्रकार', 'P', 'Country Code / देश कोड', 'IND'],
    ['Passport No. / पासपोर्ट नं.', values.passport_number, null, null],
    ['Surname / उपनाम', surname, null, null],
    ['Given Name(s) / दिया गया नाम', given, null, null],
    ['Nationality / राष्ट्रीयता', 'INDIAN', 'Sex / लिंग', sex],
    ['Date of Birth / जन्म तिथि', printedDate(values.date_of_birth), 'Place of Birth / जन्म स्थान', values.place_of_birth],
    ['Date of Issue / जारी करने की तिथि', printedDate(values.date_of_issue), 'Date of Expiry / समाप्ति तिथि', printedDate(values.date_of_expiry)],
  ];

  let y = 176;
  let body = '';
  for (const [labelA, valueA, labelB, valueB] of rows) {
    body += `<text x="250" y="${y}" font-size="12.5" fill="#6d7480">${esc(labelA)}</text>`;
    body += `<text x="250" y="${y + 22}" font-size="20" font-weight="600" fill="#141414">${esc(valueA ?? '')}</text>`;
    if (labelB) {
      body += `<text x="660" y="${y}" font-size="12.5" fill="#6d7480">${esc(labelB)}</text>`;
      body += `<text x="660" y="${y + 22}" font-size="20" font-weight="600" fill="#141414">${esc(valueB ?? '')}</text>`;
    }
    y += 54;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <rect width="${W}" height="${H}" fill="#eceadf"/>
  <rect x="20" y="20" width="960" height="660" fill="#f7f5ec" stroke="#cfc8b4"/>
  ${guilloche(W, H, accent, seed)}
  <text x="500" y="66" text-anchor="middle" font-size="22" font-weight="700" letter-spacing="2.5" fill="${accent}">REPUBLIC OF INDIA</text>
  ${localText(500, 92, 'भारत गणराज्य', 19, accent, 'middle')}
  <text x="500" y="122" text-anchor="middle" font-size="16" letter-spacing="4" fill="${accent}">PASSPORT / पासपोर्ट</text>
  <line x1="60" y1="140" x2="940" y2="140" stroke="${accent}" stroke-opacity="0.4"/>
  ${photo(66, 168, 152, 190)}
  ${body}
  <g opacity="0.5">${photo(66, 392, 96, 118)}</g>
  <text x="66" y="536" font-size="11" fill="#6d7480">Holder's signature</text>
  ${signature(70, 566, '#1a1a5a')}
  <rect x="20" y="592" width="960" height="76" fill="#fbfaf4" stroke="#cfc8b4"/>
  <text x="42" y="626" font-family="${MONO}" font-size="21" letter-spacing="2" fill="#141414">${esc(mrz1.slice(0, 44))}</text>
  <text x="42" y="656" font-family="${MONO}" font-size="21" letter-spacing="2" fill="#141414">${esc(mrz2)}</text>
  ${specimen(500, 688, 11)}
</svg>`;
}

// ── Template 3: printed certificate ───────────────────────────────────────

function certificate(doc, values, labelFor, seed) {
  const r = doc.render;
  const W = 900;
  const accent = r.accent;

  const rows = doc.fields
    .filter((f) => f.key !== r.numberField && values[f.key])
    .map((f) => [labelFor(f.key), f.type === 'date' ? printedDate(values[f.key]) : values[f.key]]);

  let y = 400;
  let body = '';
  for (const [label, value] of rows) {
    const lines = wrap(value, 46);
    body += `<text x="72" y="${y}" font-size="14.5" fill="#5d6570">${esc(label)}</text>`;
    lines.forEach((line, i) => {
      body += `<text x="330" y="${y + i * 26}" font-size="17.5" font-weight="${i === 0 ? 600 : 400}" fill="#161616">${esc(line)}</text>`;
    });
    y += 26 * lines.length + 16;
    body += `<line x1="72" y1="${y - 20}" x2="828" y2="${y - 20}" stroke="#e6e2d9"/>`;
  }

  // Keep the seal and signature clear of however many rows the document had,
  // and let the page end just below them rather than at a fixed height.
  const footY = y + 116;
  const H = footY + 150;
  const mark = r.seal ? seal(190, footY, 62, accent, 'GOVT. OF INDIA') : qr(126, footY - 66, 130, seed + 3);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <rect width="${W}" height="${H}" fill="#fdfcf8"/>
  ${guilloche(W, H, accent, seed)}
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${accent}" stroke-width="3"/>
  <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="${accent}" stroke-width="1" stroke-opacity="0.55"/>

  ${emblem(W / 2, 118, 44, accent)}
  <text x="${W / 2}" y="212" text-anchor="middle" font-size="13.5" letter-spacing="1.6" fill="#5d6570">${esc(r.org)}</text>
  <text x="${W / 2}" y="264" text-anchor="middle" font-size="30" font-weight="700" letter-spacing="1.4" fill="${accent}">${esc(r.title)}</text>
  ${localText(W / 2, 296, r.titleLocal, 22, accent, 'middle')}
  <line x1="220" y1="318" x2="680" y2="318" stroke="${accent}" stroke-opacity="0.5" stroke-width="1.5"/>

  <rect x="72" y="336" width="756" height="42" fill="${accent}" fill-opacity="0.09"/>
  <text x="88" y="363" font-size="14" fill="#5d6570">${esc(r.numberLabel ?? 'Number')}</text>
  <text x="812" y="364" text-anchor="end" font-family="${MONO}" font-size="21" font-weight="700" letter-spacing="1.2" fill="#141414">${esc(values[r.numberField] ?? '')}</text>

  ${body}
  ${mark}

  <text x="640" y="${footY - 40}" text-anchor="middle" font-size="13" fill="#5d6570">Issuing Authority</text>
  ${signature(590, footY + 2, accent)}
  <line x1="540" y1="${footY + 24}" x2="740" y2="${footY + 24}" stroke="#9aa0a8"/>
  <text x="640" y="${footY + 44}" text-anchor="middle" font-size="12" fill="#5d6570">Signature and stamp</text>

  <text x="${W / 2}" y="${H - 70}" text-anchor="middle" font-size="11.5" fill="#8a8a8a">This is a computer-generated document.</text>
  ${specimen(W / 2, H - 46, 11)}
</svg>`;
}

// ── Entry point ───────────────────────────────────────────────────────────

const TEMPLATES = { 'id-card': idCard, 'passport-page': passportPage, certificate };

export function renderDocument(doc, values, seed = 1) {
  const labelFor = (key) => doc.fields.find((f) => f.key === key)?.label ?? key;
  const template = TEMPLATES[doc.render.template];
  if (!template) throw new Error(`No template called "${doc.render.template}".`);
  return template(doc, values, labelFor, seed);
}
