// Working out which documents in a pile belong to the same person or company.
//
// Deliberately not a model's job. Everything here is arithmetic on the values
// already read off each document, so every grouping comes with a reason a human
// can check: "both carry the same PAN", "the GST number contains that PAN",
// "named as a director on the certificate". A model is asked afterwards only to
// put the result into words.

import { getDocument } from '../../public/lib/documents.js';
import { upperAlnum } from '../../public/lib/validators.js';

// ── Names ─────────────────────────────────────────────────────────────────

const HONORIFICS = new Set(['shri', 'sri', 'smt', 'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'late', 'm/s', 'messrs']);
const COMPANY_WORDS = new Set([
  'private', 'pvt', 'limited', 'ltd', 'llp', 'company', 'co', 'corporation', 'corp',
  'enterprises', 'enterprise', 'industries', 'trading', 'traders', 'and', '&',
]);

/**
 * Folds the ways the same Indian name gets spelt in English: Sandeep/Sandip,
 * Venkatesan/Venkateshan, Meenakshi/Meenaakshi. Not linguistics — just the
 * substitutions that actually turn up on paperwork.
 */
export function foldToken(token) {
  return token
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/aa+/g, 'a')
    .replace(/ee+/g, 'i')
    .replace(/ii+/g, 'i')
    .replace(/oo+/g, 'u')
    .replace(/uu+/g, 'u')
    .replace(/ph/g, 'f')
    .replace(/sh/g, 's')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/([bcdfgjklmnprstv])\1+/g, '$1')
    .replace(/y$/, 'i');
}

/** Consonant skeleton — catches Mohammed/Mohammad, but too loose to trust alone. */
const skeleton = (token) => {
  const folded = foldToken(token);
  return folded.slice(0, 1) + folded.slice(1).replace(/[aeiou]/g, '');
};

function nameTokens(name, { company = false } = {}) {
  return String(name ?? '')
    .split(/[\s.,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !HONORIFICS.has(t.toLowerCase()))
    .filter((t) => !company || !COMPANY_WORDS.has(t.toLowerCase().replace(/\./g, '')))
    .filter((t) => /[a-zA-Z]/.test(t));
}

/** Does a single-letter token stand for this one? "S" for "Sharma". */
const initialFor = (initial, token) => initial.length === 1 && foldToken(token).startsWith(foldToken(initial));

/**
 * 0 to 1. 1 means the same name written the same way; 0.85+ means the same
 * person as far as paperwork goes; below 0.7, treat as different people.
 */
export function nameSimilarity(a, b, options = {}) {
  const left = nameTokens(a, options);
  const right = nameTokens(b, options);
  if (!left.length || !right.length) return 0;

  const foldedLeft = left.map(foldToken);
  const foldedRight = right.map(foldToken);

  if (foldedLeft.join(' ') === foldedRight.join(' ')) return 1;

  // Every token of the shorter name accounted for in the longer one, allowing
  // initials: "Priya V." against "Priya Venkatesan".
  const [shortSide, longSide] = foldedLeft.length <= foldedRight.length ? [left, right] : [right, left];
  const remaining = [...longSide];
  let covered = 0;

  for (const token of shortSide) {
    const hit = remaining.findIndex((other) => foldToken(other) === foldToken(token) || initialFor(token, other) || initialFor(other, token));
    if (hit >= 0) {
      remaining.splice(hit, 1);
      covered += 1;
    }
  }

  if (covered === shortSide.length) {
    // A full cover of a shorter name is strong, but less so the more was dropped.
    return shortSide.length === longSide.length ? 0.95 : 0.88;
  }

  if (left.map(skeleton).sort().join(' ') === right.map(skeleton).sort().join(' ')) return 0.8;

  const union = new Set([...foldedLeft, ...foldedRight]).size;
  return union ? covered / union : 0;
}

// ── Identifiers ───────────────────────────────────────────────────────────

/**
 * Which form field on which document holds which kind of number. Keyed by
 * document because the same field name means different things in different
 * places — `registration_number` is a vehicle on an RC and a birth entry on a
 * birth certificate.
 */
const ID_FIELDS = {
  aadhaar: { aadhaar_number: 'aadhaar' },
  pan: { pan_number: 'pan' },
  driving_licence: { licence_number: 'driving_licence' },
  passport: { passport_number: 'passport' },
  voter_id: { epic_number: 'voter_id' },
  vehicle_rc: { registration_number: 'vehicle_registration', chassis_number: 'other', engine_number: 'other' },
  ration_card: { card_number: 'ration_card' },
  birth_certificate: { registration_number: 'birth_registration' },
  gst_certificate: { gstin: 'gstin' },
  udyam: { udyam_number: 'udyam' },
  nrega_job_card: { job_card_number: 'job_card' },
  abha: { abha_number: 'abha' },
  din_letter: { din: 'din' },
  incorporation: { cin: 'cin', company_pan: 'pan' },
  bank_passbook: { account_number: 'bank_account', ifsc: 'ifsc' },
};

/** Which field carries the name the document is chiefly about. */
const SUBJECT_FIELDS = {
  aadhaar: 'name',
  pan: 'name',
  driving_licence: 'name',
  passport: null, // built from surname + given name
  voter_id: 'name',
  vehicle_rc: 'owner_name',
  ration_card: 'head_of_family',
  birth_certificate: 'name',
  gst_certificate: 'legal_name',
  udyam: 'enterprise_name',
  nrega_job_card: 'name',
  abha: 'name',
  din_letter: 'name',
  incorporation: 'company_name',
  bank_passbook: 'account_holder',
};

/** An identifier value, comparable across documents. Hyphens matter in some. */
export function normaliseId(type, value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (type === 'udyam' || type === 'job_card') return raw.toUpperCase().replace(/\s+/g, '');
  return upperAlnum(raw) || null;
}

/** A GST number carries its holder's PAN in characters 3 to 12. */
export function panInsideGstin(gstin) {
  const g = upperAlnum(gstin);
  return /^\d{2}[A-Z]{5}\d{4}[A-Z]/.test(g) ? g.slice(2, 12) : null;
}

/** PAN's 4th character: P is a person, C a company, F a firm, H a family. */
export function panHolderKind(pan) {
  const p = upperAlnum(pan);
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(p)) return null;
  return { P: 'person', C: 'company', F: 'firm', H: 'family', T: 'trust', A: 'association', B: 'association', G: 'government', L: 'authority', J: 'juridical' }[p[3]] ?? null;
}

/**
 * Turns one identified-and-read document into the facts linking cares about.
 *
 * @param {object} entry  { id, type, extracted, identify }
 */
export function factsFor(entry) {
  const doc = getDocument(entry.type);
  const extracted = entry.extracted ?? {};
  const identify = entry.identify ?? {};

  const identifiers = [];
  const push = (type, value, holder, derived = false) => {
    const normalised = normaliseId(type, value);
    if (normalised) identifiers.push({ type, value: normalised, holder: holder ?? null, derived });
  };

  const subjectName = doc
    ? entry.type === 'passport'
      ? [extracted.given_name, extracted.surname].filter(Boolean).join(' ')
      : (extracted[SUBJECT_FIELDS[entry.type]] ?? null)
    : (identify.belongs_to?.primary_name ?? null);

  // Numbers off the filled-in form, which are the canonical ones.
  for (const [field, type] of Object.entries(ID_FIELDS[entry.type] ?? {})) {
    push(type, extracted[field], field === 'company_pan' ? extracted.company_name : subjectName);
  }

  // Anything the first pass saw that the form has no place for — the only
  // source at all for a document we do not have a form for.
  for (const found of identify.identifiers ?? []) {
    const already = identifiers.some((i) => i.value === normaliseId(found.type, found.value));
    if (!already) push(found.type, found.value, found.holder_name);
  }

  // A GST number contains its holder's PAN. This is the single most useful
  // link in the whole pile: it ties a business to the person who registered it.
  for (const gst of identifiers.filter((i) => i.type === 'gstin')) {
    const pan = panInsideGstin(gst.value);
    if (pan) push('pan', pan, gst.holder, true);
  }

  const people = (identify.people ?? []).map((p) => ({ ...p, name: String(p.name ?? '').trim() })).filter((p) => p.name);
  const organisations = (identify.organisations ?? []).map((o) => ({ ...o, name: String(o.name ?? '').trim() })).filter((o) => o.name);

  return {
    id: entry.id,
    type: entry.type,
    label: doc?.name ?? identify.document?.name_if_other ?? 'Unrecognised document',
    entityKind: doc?.entity ?? (identify.belongs_to?.kind === 'organisation' ? 'company' : 'person'),
    subjectName,
    dateOfBirth: extracted.date_of_birth ?? people.find((p) => /holder|self|applicant|child/i.test(p.role ?? ''))?.date_of_birth ?? null,
    address: extracted.address ?? extracted.registered_office ?? null,
    relatives: [extracted.guardian_name, extracted.father_name, extracted.mother_name].filter(Boolean),
    mentionedNames: [
      ...people.map((p) => p.name),
      ...String(extracted.directors ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      ...[extracted.owner_name, extracted.account_holder].filter(Boolean),
    ],
    organisations: [...organisations.map((o) => o.name), ...[extracted.company_name, extracted.trade_name, extracted.legal_name, extracted.enterprise_name].filter(Boolean)],
    identifiers,
  };
}

// ── Grouping ──────────────────────────────────────────────────────────────

class Groups {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.reasons = [];
  }

  find(i) {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }

  join(a, b, reason) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    this.reasons.push({ a, b, reason });
    if (rootA !== rootB) this.parent[rootB] = rootA;
  }
}

const sameDay = (a, b) => Boolean(a && b) && String(a).slice(0, 10) === String(b).slice(0, 10);

/** Address comparison that survives reordering and abbreviation. */
function addressOverlap(a, b) {
  const tokens = (value) =>
    new Set(
      String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2),
    );
  const left = tokens(a);
  const right = tokens(b);
  if (left.size < 3 || right.size < 3) return 0;
  const shared = [...left].filter((t) => right.has(t)).length;
  return shared / Math.min(left.size, right.size);
}

/**
 * Groups documents by who they are about, and works out how those groups
 * relate to each other.
 *
 * @param {Array} entries  one per document, from factsFor()
 */
export function linkDocuments(entries) {
  const facts = entries;
  const groups = new Groups(facts.length);
  const conflicts = [];

  // 1. A shared reference number is the strongest evidence there is.
  const byIdentifier = new Map();
  for (const [index, doc] of facts.entries()) {
    for (const identifier of doc.identifiers) {
      if (identifier.derived || identifier.type === 'other' || identifier.type === 'ifsc') continue;
      const key = `${identifier.type}:${identifier.value}`;
      if (!byIdentifier.has(key)) byIdentifier.set(key, []);
      byIdentifier.get(key).push({ index, identifier });
    }
  }

  for (const [key, holders] of byIdentifier) {
    if (holders.length < 2) continue;
    const [type, value] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];

    for (let i = 1; i < holders.length; i++) {
      const first = facts[holders[0].index];
      const other = facts[holders[i].index];
      groups.join(holders[0].index, holders[i].index, `Both carry the same ${LABELS[type] ?? type}, ${value}.`);

      // The same number against two different names is the thing you most want
      // to be told about, so it is raised rather than quietly resolved.
      const similarity = nameSimilarity(first.subjectName, other.subjectName);
      if (first.subjectName && other.subjectName && similarity < 0.7) {
        conflicts.push({
          severity: 'high',
          message: `The same ${LABELS[type] ?? type} (${value}) appears under two different names: "${first.subjectName}" on the ${first.label}, and "${other.subjectName}" on the ${other.label}.`,
          documents: [first.id, other.id],
        });
      }
      if (first.dateOfBirth && other.dateOfBirth && !sameDay(first.dateOfBirth, other.dateOfBirth)) {
        conflicts.push({
          severity: 'high',
          message: `The same ${LABELS[type] ?? type} (${value}) carries two different dates of birth: ${first.dateOfBirth} and ${other.dateOfBirth}.`,
          documents: [first.id, other.id],
        });
      }
    }
  }

  // 2. Same name, plus something else that agrees.
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const a = facts[i];
      const b = facts[j];
      if (groups.find(i) === groups.find(j)) continue;
      if (!a.subjectName || !b.subjectName) continue;

      // A person and a company are never the same entity, however alike the
      // names — "Joshi" the man is not "Joshi Traders" the business.
      if (a.entityKind === 'person' && b.entityKind === 'company') continue;
      if (a.entityKind === 'company' && b.entityKind === 'person') continue;

      const company = a.entityKind === 'company' || b.entityKind === 'company';
      const similarity = nameSimilarity(a.subjectName, b.subjectName, { company });
      if (similarity < 0.85) continue;

      const exact = similarity >= 0.95;
      if (sameDay(a.dateOfBirth, b.dateOfBirth)) {
        groups.join(i, j, `Same name and the same date of birth (${String(a.dateOfBirth).slice(0, 10)}).`);
      } else if (addressOverlap(a.address, b.address) >= 0.6) {
        groups.join(i, j, 'Same name and the same address.');
      } else if (a.relatives.length && b.relatives.length && a.relatives.some((x) => b.relatives.some((y) => nameSimilarity(x, y) >= 0.85))) {
        groups.join(i, j, "Same name and the same father's or guardian's name.");
      } else if (exact && company) {
        groups.join(i, j, 'The same organisation name.');
      }
    }
  }

  // Assemble the groups.
  const buckets = new Map();
  for (const [index, doc] of facts.entries()) {
    const root = groups.find(index);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push({ index, doc });
  }

  const entities = [...buckets.values()].map((members, n) => {
    const docs = members.map((m) => m.doc);
    const indices = members.map((m) => m.index);
    const kind = docs.some((d) => d.entityKind === 'company') && !docs.some((d) => d.entityKind === 'person') ? 'company' : 'person';

    // The fullest name reads best as a label — "Sandeep Joshi" over "S Joshi" —
    // but not a passport's block capitals if anything else is available.
    const shouted = (value) => value === value.toUpperCase() && /[A-Z]{4}/.test(value);
    const name =
      docs
        .map((d) => d.subjectName)
        .filter(Boolean)
        .sort((x, y) => shouted(x) - shouted(y) || y.length - x.length)[0] ?? 'Unnamed';

    return {
      id: `entity-${n + 1}`,
      kind,
      name,
      documents: docs.map((d) => d.id),
      dateOfBirth: docs.map((d) => d.dateOfBirth).find(Boolean) ?? null,
      address: docs.map((d) => d.address).find(Boolean) ?? null,
      identifiers: dedupeIdentifiers(docs.flatMap((d) => d.identifiers)),
      evidence: groups.reasons.filter((r) => indices.includes(r.a) && indices.includes(r.b)).map((r) => r.reason),
    };
  });

  return {
    entities,
    relationships: findRelationships(facts, entities),
    conflicts,
  };
}

function dedupeIdentifiers(identifiers) {
  const seen = new Map();
  for (const identifier of identifiers) {
    const key = `${identifier.type}:${identifier.value}`;
    if (!seen.has(key) || (seen.get(key).derived && !identifier.derived)) seen.set(key, identifier);
  }
  return [...seen.values()];
}

const LABELS = {
  aadhaar: 'Aadhaar number',
  pan: 'PAN',
  passport: 'passport number',
  voter_id: 'voter ID number',
  driving_licence: 'driving licence number',
  vehicle_registration: 'vehicle registration number',
  gstin: 'GST number',
  udyam: 'Udyam number',
  din: 'director ID number',
  cin: 'company number',
  abha: 'ABHA number',
  ration_card: 'ration card number',
  job_card: 'job card number',
  bank_account: 'bank account number',
  birth_registration: 'birth registration number',
};

/**
 * How the groups connect: which person runs which business, who sits on which
 * board. These are relationships, not merges — a man and his company are two
 * entities, however tightly bound.
 */
function findRelationships(facts, entities) {
  const relationships = [];
  const entityOf = new Map();
  for (const entity of entities) for (const docId of entity.documents) entityOf.set(docId, entity);

  const add = (from, to, kind, reason) => {
    if (!from || !to || from.id === to.id) return;
    const already = relationships.find((r) => r.from === from.id && r.to === to.id && r.kind === kind);
    if (!already) relationships.push({ from: from.id, to: to.id, from_name: from.name, to_name: to.name, kind, reason });
  };

  const people = entities.filter((e) => e.kind === 'person');
  const findPerson = (name) => people.find((p) => nameSimilarity(p.name, name) >= 0.85);

  for (const doc of facts) {
    const owner = entityOf.get(doc.id);

    // A GST number contains the PAN of whoever registered it. When that PAN
    // belongs to a person in the pile, the business is theirs.
    for (const derived of doc.identifiers.filter((i) => i.type === 'pan' && i.derived)) {
      const match = entities.find((e) => e.id !== owner?.id && e.identifiers.some((i) => i.type === 'pan' && !i.derived && i.value === derived.value));
      if (match) {
        const kindOfHolder = panHolderKind(derived.value);
        add(
          match,
          owner,
          kindOfHolder === 'person' ? 'runs' : 'linked',
          `The GST number on the ${doc.label} contains the PAN ${derived.value}, which is ${match.name}'s. A GST registration carries the PAN of whoever holds it.`,
        );
      }
    }

    // Directors, owners and account holders named on a company's paperwork.
    if (doc.entityKind === 'company' || doc.type === 'incorporation' || doc.type === 'udyam') {
      for (const name of doc.mentionedNames) {
        const person = findPerson(name);
        if (!person || person.id === owner?.id) continue;
        const role = doc.type === 'incorporation' ? 'director of' : 'runs';
        add(
          person,
          owner,
          role,
          doc.type === 'incorporation'
            ? `Named as a director on the certificate of incorporation for ${owner?.name ?? 'the company'}.`
            : `Named as the owner on the ${doc.label}.`,
        );
      }
    }

    // A director ID with no company paperwork in the pile is still worth saying.
    const din = doc.identifiers.find((i) => i.type === 'din');
    if (din && owner?.kind === 'person') {
      const companies = entities.filter((e) => e.kind === 'company');
      if (!companies.length) {
        relationships.push({
          from: owner.id,
          to: null,
          from_name: owner.name,
          to_name: null,
          kind: 'notes',
          reason: `${owner.name} holds director ID ${din.value}, so they are a director of at least one company — but no company paperwork was included.`,
        });
      }
    }
  }

  // Same address across a person and a business is worth mentioning, weakly.
  for (const person of people) {
    for (const company of entities.filter((e) => e.kind === 'company')) {
      const alreadyLinked = relationships.some(
        (r) => (r.from === person.id && r.to === company.id) || (r.from === company.id && r.to === person.id),
      );
      if (alreadyLinked) continue;
      if (addressOverlap(person.address, company.address) >= 0.7) {
        add(person, company, 'shares an address with', `${company.name} is registered at the same address as ${person.name}.`);
      }
    }
  }

  return relationships;
}
