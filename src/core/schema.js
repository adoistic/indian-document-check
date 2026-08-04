// Builds the JSON schema and the instructions for the two things the app does:
// reading a document, and checking a document against what someone typed.
//
// Both schemas are strict — every key required, no extra keys allowed — so the
// response always has the shape the interface expects.

import { getDocument, isCriticalField } from '../../public/lib/documents.js';

const nullableString = { type: ['string', 'null'] };

const VERDICTS = ['match', 'partial_match', 'mismatch', 'not_found_on_document', 'not_submitted'];

/** Describes a field to the model in terms of what is printed on the page. */
function fieldHint(field) {
  const bits = [field.label];
  if (field.help) bits.push(field.help);
  if (field.type === 'date') bits.push('Give the date as YYYY-MM-DD. If only a year is printed, give just the year.');
  if (field.type === 'select' && field.options) bits.push(`One of: ${field.options.join(', ')}.`);
  return bits.join(' ');
}

function extractedProperties(doc) {
  return Object.fromEntries(
    doc.fields.map((field) => [
      field.key,
      field.type === 'date' ? { type: ['string', 'null'], description: fieldHint(field) } : { ...nullableString, description: fieldHint(field) },
    ]),
  );
}

const documentAssessment = (doc) => ({
  type: 'object',
  additionalProperties: false,
  required: ['document_type', 'is_legible', 'notes'],
  properties: {
    document_type: {
      type: 'string',
      enum: ['expected_document', 'different_government_document', 'not_a_government_document', 'unreadable'],
      description: `"expected_document" only if this really is an Indian ${doc.name}. If it is some other official document, say "different_government_document" and name it in the notes.`,
    },
    is_legible: { type: 'boolean', description: 'Can the printed text be read well enough to work with?' },
    notes: { type: 'string', description: 'One or two plain sentences about the image: what it is, and anything that got in the way of reading it. No jargon.' },
  },
});

// ── Reading a document to fill the form ───────────────────────────────────

export function extractionSchema(docId) {
  const doc = getDocument(docId);
  return {
    name: 'document_extraction',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['document_assessment', 'extracted'],
      properties: {
        document_assessment: documentAssessment(doc),
        extracted: {
          type: 'object',
          additionalProperties: false,
          required: doc.fields.map((f) => f.key),
          description: 'Exactly what is printed. Use null for anything not on the page or not readable.',
          properties: extractedProperties(doc),
        },
      },
    },
  };
}

export function extractionPrompt(docId) {
  const doc = getDocument(docId);
  const lines = doc.fields.map((f) => `- ${f.key}: ${fieldHint(f)}`);

  return {
    system: `You read Indian government documents and copy out what is printed on them.

You will be shown an image of ${aOrAn(doc.name)} issued by the ${doc.issuer}. Copy out each requested field exactly as printed.

Rules:
- Copy, do not interpret. If the card says "RAJESH KUMAR SHARMA", give "Rajesh Kumar Sharma" — you may fix the capitalisation, nothing else.
- Indian documents often print the same details twice, once in English and once in a regional script. Use the English version.
- Give dates as YYYY-MM-DD. If a document prints only a year of birth, give just that year.
- Strip spaces and separators from ID numbers unless the separator is part of the number (a Udyam or job card number keeps its hyphens).
- Never guess. If a field is not on the page, is covered, or is too blurred to read, return null for it. A null is far better than a wrong value, because somebody is about to rely on this.
- If the image is not ${aOrAn(doc.name)} at all, say so in document_assessment and return null for every field.`,
    user: `Read this ${doc.name} and copy out these fields:\n${lines.join('\n')}`,
  };
}

// ── Checking a document against what someone typed ────────────────────────

export function verificationSchema(docId) {
  const doc = getDocument(docId);
  const keys = doc.fields.map((f) => f.key);

  return {
    name: 'document_verification',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['document_assessment', 'extracted', 'field_results', 'overall_verdict', 'summary', 'concerns'],
      properties: {
        document_assessment: documentAssessment(doc),
        extracted: {
          type: 'object',
          additionalProperties: false,
          required: keys,
          description: 'What the document actually says. null where a field is absent or unreadable.',
          properties: extractedProperties(doc),
        },
        field_results: {
          type: 'array',
          description: 'One entry per field, in the order given.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['field', 'submitted_value', 'extracted_value', 'verdict', 'reason'],
            properties: {
              field: { type: 'string', enum: keys },
              submitted_value: nullableString,
              extracted_value: nullableString,
              verdict: { type: 'string', enum: VERDICTS },
              reason: {
                type: 'string',
                description:
                  'One short sentence a person with no training can act on. When something differs, say what was typed and what the document says. No jargon, no percentages.',
              },
            },
          },
        },
        overall_verdict: {
          type: 'string',
          enum: ['match', 'partial_match', 'mismatch', 'wrong_document', 'undetermined'],
          description:
            'match: everything filled in agrees with the document. partial_match: the important details agree but something smaller differs. mismatch: at least one important detail disagrees. wrong_document: this is not the kind of document that was asked for. undetermined: it is the right kind of document but could not be read well enough to say.',
        },
        summary: {
          type: 'string',
          description: 'Two or three plain sentences for someone at a counter deciding whether to accept this. No jargon.',
        },
        concerns: {
          type: 'array',
          description: 'Anything that should make a person look more closely — signs of editing, mismatched fonts, an expired document. Empty if nothing stands out.',
          items: { type: 'string' },
        },
      },
    },
  };
}

export function verificationPrompt(docId, submission) {
  const doc = getDocument(docId);
  const critical = doc.fields.filter((f) => isCriticalField(f.key)).map((f) => f.label);

  const submitted = doc.fields
    .map((field) => {
      const value = submission[field.key];
      return `- ${field.label} (${field.key}): ${value && String(value).trim() ? String(value).trim() : '(left blank)'}`;
    })
    .join('\n');

  return {
    system: `You check whether the details somebody typed into a form match the Indian government document they handed over. You are being read by a clerk, not an engineer — write every explanation in plain English.

The document is ${aOrAn(doc.name)} issued by the ${doc.issuer}.

How to compare:
- Compare meaning, not characters. "Rajesh K. Sharma" against "Rajesh Kumar Sharma" is a partial match. "Ramesh Sharma" against "Rajesh Sharma" is a mismatch.
- Indian documents print names in English and in a regional script. Those are the same name, not a difference.
- Dates written 01/01/1990, 1990-01-01 and "1 Jan 1990" are the same date. Where a document shows only a year of birth and the typed date falls inside that year, that is a partial match.
- Addresses: ignore ordering, punctuation, and abbreviations like Rd/Road or Apt/Apartment. Ask whether they describe the same place. A different house number, street, town or PIN code is a mismatch.
- ID numbers: compare only the characters, ignoring spaces and hyphens. Any character that differs is a mismatch. If part of the number is masked on the document, compare only what is visible and say so.
- A field left blank on the form is "not_submitted". A field the document does not carry is "not_found_on_document". Neither is a mismatch.
- The details that matter most here are: ${critical.join(', ')}. If any of those disagree, the overall verdict is a mismatch. If every one of those agrees and only a less important field differs, the overall verdict is "partial_match" — say plainly what differs, but do not escalate it to a mismatch.
- Sort out what the document *is* before you judge what it says. If the picture is not ${aOrAn(doc.name)} — it is a different official document, or not a document at all — the overall verdict is "wrong_document", and your summary should name what was handed over instead. Do not report it as a mismatch; the person has brought the wrong paper, which is a different problem from having the wrong details.
- If it is the right kind of document but too blurred, too dark or too cropped to read, return "undetermined" rather than guessing.

Some sample documents are marked as specimens or synthetic test data. That marking is not itself a problem — judge the printed details exactly as you would on a real one, and just mention the marking in your notes.

Never invent a value you cannot see. Return null instead.`,
    user: `Details typed into the form:\n${submitted}\n\nThe image is the ${doc.name} the same person handed over. Compare every field against it.`,
  };
}

function aOrAn(word) {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}
