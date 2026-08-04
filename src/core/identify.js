// Working out what a document is when nobody has told you.
//
// This is the first of two passes over each file in a pile. It answers "what am
// I looking at, and who is it about?" — enough to pick the right form and enough
// to start linking documents together. The second pass is the existing
// readDocument(), which fills that form exactly.

import { DOCUMENTS } from '../../public/lib/documents.js';

const nullableString = { type: ['string', 'null'] };

/** The kinds of number the app recognises when it meets one in the wild. */
export const IDENTIFIER_TYPES = [
  'aadhaar',
  'pan',
  'passport',
  'voter_id',
  'driving_licence',
  'vehicle_registration',
  'gstin',
  'udyam',
  'din',
  'cin',
  'abha',
  'ration_card',
  'job_card',
  'bank_account',
  'ifsc',
  'birth_registration',
  'other',
];

export const IDENTIFY_SCHEMA = {
  name: 'document_identification',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['document', 'belongs_to', 'people', 'organisations', 'identifiers'],
    properties: {
      document: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'certainty', 'name_if_other', 'is_legible', 'notes'],
        properties: {
          type: {
            type: 'string',
            enum: [...DOCUMENTS.map((d) => d.id), 'other'],
            description: 'Which of the known documents this is. Use "other" if it is not one of them, including if it is not a document at all.',
          },
          certainty: { type: 'string', enum: ['high', 'medium', 'low'] },
          name_if_other: { type: ['string', 'null'], description: 'When the type is "other", say plainly what it is — "a shop receipt", "an electricity bill", "a photograph of a wall".' },
          is_legible: { type: 'boolean' },
          notes: { type: 'string', description: 'One plain sentence: what this is and how readable it is.' },
        },
      },
      belongs_to: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'primary_name'],
        properties: {
          kind: {
            type: 'string',
            enum: ['person', 'organisation', 'both', 'unclear'],
            description: 'Whose document this is. "both" when a document is about a company but names an individual as its owner or director.',
          },
          primary_name: { type: ['string', 'null'], description: 'The single name this document is chiefly about — the cardholder, or the company.' },
        },
      },
      people: {
        type: 'array',
        description: 'Everybody named on the document, including relatives, directors and account holders.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'role', 'date_of_birth', 'address'],
          properties: {
            name: { type: 'string' },
            role: { type: 'string', description: 'How they appear: holder, father, mother, husband, director, owner, guardian, nominee.' },
            date_of_birth: { type: ['string', 'null'], description: 'YYYY-MM-DD, or just the year if that is all there is.' },
            address: nullableString,
          },
        },
      },
      organisations: {
        type: 'array',
        description: 'Companies or firms the document is about. Not the government body that issued it.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'kind', 'address'],
          properties: {
            name: { type: 'string' },
            kind: { type: 'string', description: 'Private limited company, proprietorship, partnership, bank, and so on — or "unknown".' },
            address: nullableString,
          },
        },
      },
      identifiers: {
        type: 'array',
        description: 'Every reference number printed on the document.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'value', 'holder_name'],
          properties: {
            type: { type: 'string', enum: IDENTIFIER_TYPES },
            value: { type: 'string', description: 'Exactly as printed, minus spaces — except where a hyphen is part of the number.' },
            holder_name: { type: ['string', 'null'], description: 'Whose number it is, if the document says.' },
          },
        },
      },
    },
  },
};

const catalogue = () =>
  DOCUMENTS.map((d) => `- ${d.id}: ${d.name}, issued by ${d.issuer}. ${d.blurb}`).join('\n');

export const IDENTIFY_PROMPT = {
  system: `You sort through Indian identity and business paperwork. Somebody has handed you a pile of scans and photographs with no explanation, and you have to work out what each one is and who it is about.

These are the documents you recognise:
${catalogue()}

Rules:
- Name the document from what is printed on it — the issuing body, the title, the layout, the shape of the reference number. Do not guess from a single number.
- If it is not one of the documents listed, the type is "other" and you say plainly what it actually is. A grocery receipt is not a failure to identify; it is a grocery receipt.
- List every person named, not just the main one. A father's name on an Aadhaar card, the directors on a certificate of incorporation, and a nominee on a passbook all matter, because they are how one document gets connected to another.
- List every reference number, and say whose it is where the document makes that clear. This includes numbers that belong to someone other than the main subject.
- Copy numbers exactly. Strip spaces, but keep hyphens where the number is written with them.
- Never invent anything. If a field is not there or cannot be read, leave it null. A blank is safe; a wrong value is not, because these get matched against each other afterwards.
- Documents marked as specimens or samples are still to be read normally. Note the marking and carry on.`,
  user: 'Work out what this document is and who it is about.',
};
