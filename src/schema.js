// The JSON Schema handed to the model via OpenRouter's `response_format:
// { type: "json_schema" }`. Kept strict — every property is required and
// `additionalProperties` is false everywhere — so the model cannot invent keys
// and the server never has to guess at the shape of what came back.

/** Fields the form collects and the model is asked to compare. */
export const FIELDS = [
  { key: 'name', label: 'Full name' },
  { key: 'date_of_birth', label: 'Date of birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'address', label: 'Address' },
  { key: 'aadhaar_number', label: 'Aadhaar number' },
  { key: 'guardian_name', label: "Father's / guardian's name" },
];

const FIELD_KEYS = FIELDS.map((f) => f.key);

const nullableString = { type: ['string', 'null'] };

export const VERIFICATION_SCHEMA = {
  name: 'aadhaar_form_verification',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['document_assessment', 'extracted', 'field_results', 'overall_verdict', 'overall_confidence', 'summary', 'red_flags'],
    properties: {
      document_assessment: {
        type: 'object',
        additionalProperties: false,
        required: ['document_type', 'is_legible', 'notes'],
        properties: {
          document_type: {
            type: 'string',
            enum: ['aadhaar_card', 'other_id_document', 'not_an_id_document', 'unreadable'],
            description: 'What the uploaded image actually is.',
          },
          is_legible: {
            type: 'boolean',
            description: 'True if the text on the document can be read well enough to compare fields.',
          },
          notes: {
            type: 'string',
            description: 'One or two sentences on image quality, cropping, glare, or anything that limited the reading.',
          },
        },
      },
      extracted: {
        type: 'object',
        additionalProperties: false,
        required: FIELD_KEYS,
        description: 'Values read off the document, verbatim. Use null when a field is absent or unreadable.',
        properties: {
          name: nullableString,
          date_of_birth: { type: ['string', 'null'], description: 'Normalised to YYYY-MM-DD when a full date is printed; otherwise the year as printed.' },
          gender: nullableString,
          address: { type: ['string', 'null'], description: 'Full address as printed, on a single line.' },
          aadhaar_number: { type: ['string', 'null'], description: '12 digits, no spaces. Null if masked or partially hidden.' },
          guardian_name: { type: ['string', 'null'], description: "Father's, husband's, or guardian's name if the card prints one (S/O, D/O, W/O, C/O)." },
        },
      },
      field_results: {
        type: 'array',
        description: 'One entry per field the user submitted, in the same order as the form.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['field', 'submitted_value', 'extracted_value', 'verdict', 'confidence', 'reason'],
          properties: {
            field: { type: 'string', enum: FIELD_KEYS },
            submitted_value: nullableString,
            extracted_value: nullableString,
            verdict: {
              type: 'string',
              enum: ['match', 'partial_match', 'mismatch', 'not_found_on_document', 'not_submitted'],
            },
            confidence: { type: 'number', description: 'Between 0 and 1.' },
            reason: { type: 'string', description: 'Short, specific justification. Quote the differing text when there is a mismatch.' },
          },
        },
      },
      overall_verdict: {
        type: 'string',
        enum: ['match', 'partial_match', 'mismatch', 'undetermined'],
        description:
          'match = every submitted field agrees with the document. partial_match = the identity-defining fields agree but something minor differs. mismatch = at least one identity-defining field disagrees. undetermined = the document could not be read well enough to judge.',
      },
      overall_confidence: { type: 'number', description: 'Between 0 and 1.' },
      summary: { type: 'string', description: 'Two or three sentences a human reviewer can act on.' },
      red_flags: {
        type: 'array',
        description: 'Signs of tampering, inconsistency, or anything a compliance reviewer should look at. Empty array if none.',
        items: { type: 'string' },
      },
    },
  },
};

export const SYSTEM_PROMPT = `You are a KYC document-verification assistant. You are given (a) a set of details a person typed into a form and (b) an image of the identity document they uploaded — normally an Indian Aadhaar card, front and/or back.

Your job is to read the document and report, field by field, whether the typed details match what the document actually says.

Rules for comparison:
- Compare meaning, not characters. "Rajesh Kumar Sharma" vs "Rajesh K. Sharma" is a partial_match; "Rajesh Sharma" vs "Ramesh Sharma" is a mismatch.
- Transliteration and script differences are not mismatches. Aadhaar cards print the name in English and in a regional script; treat them as the same name.
- Dates: 01/01/1990, 1990-01-01 and "01-01-1990" are the same date. Some cards print only a year of birth — if the submitted date of birth falls in that year, that is a partial_match, not a mismatch.
- Addresses: ignore ordering, punctuation, abbreviations (Rd/Road, Apt/Apartment), and PIN-code spacing. Judge whether they describe the same place. A different house number, street, city, or PIN code is a mismatch.
- Aadhaar number: compare the 12 digits only, ignoring spaces. Any digit difference is a mismatch. If the number on the card is masked (e.g. "XXXX XXXX 1234"), only compare the visible digits and say so in the reason.
- A field the user left blank is "not_submitted". A field absent from the document is "not_found_on_document". Neither is a mismatch.
- The identity-defining fields are name, date of birth and Aadhaar number. A disagreement in any of those makes the overall verdict a mismatch.
- If the image is unreadable, not an identity document, or too cropped to judge, set the overall verdict to "undetermined" rather than guessing.

Some test documents are clearly labelled as specimens, samples or synthetic test data. That labelling is not itself a mismatch or a red flag — evaluate the printed fields exactly as you would on a real card, and simply note the labelling in document_assessment.notes.

Never invent a value you cannot actually see on the document. Return null instead.`;

/** Renders the submitted form into the text half of the user message. */
export function buildUserPrompt(submission) {
  const lines = FIELDS.map(({ key, label }) => {
    const value = submission[key];
    return `- ${label}: ${value ? String(value).trim() : '(not provided)'}`;
  });

  return `Details submitted on the form:\n${lines.join('\n')}\n\nThe attached image is the identity document the same person uploaded. Compare every submitted field against it and return the structured verification result.`;
}
