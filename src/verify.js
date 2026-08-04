import { SYSTEM_PROMPT, VERIFICATION_SCHEMA, buildUserPrompt, FIELDS } from './schema.js';
import { isValidAadhaar, normalizeAadhaar } from './aadhaar.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite';

export class VerificationError extends Error {
  constructor(message, status = 502, detail) {
    super(message);
    this.name = 'VerificationError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * A data URL, or a bare base64 string we assume is a PNG.
 * The model needs `data:<mime>;base64,<payload>`.
 */
function asDataUrl(image) {
  const value = String(image ?? '').trim();
  if (!value) throw new VerificationError('No document image was supplied.', 400);
  if (value.startsWith('data:')) {
    const mime = value.slice(5, value.indexOf(';'));
    if (mime === 'application/pdf') {
      throw new VerificationError(
        'PDFs must be rasterised to an image before verification. The web UI does this in the browser; if you are calling the API directly, send a PNG or JPEG.',
        400,
      );
    }
    if (!mime.startsWith('image/')) {
      throw new VerificationError(`Unsupported document type "${mime}". Send a PNG, JPEG or WebP image.`, 400);
    }
    return value;
  }
  return `data:image/png;base64,${value}`;
}

/**
 * Local, deterministic checks that do not need the model. These run regardless of
 * what the model says, so a structurally impossible Aadhaar number is caught even
 * when the image is unreadable.
 */
export function localChecks(submission) {
  const checks = [];
  const digits = normalizeAadhaar(submission.aadhaar_number);

  if (digits) {
    if (digits.length !== 12) {
      checks.push({ level: 'error', message: `Aadhaar number has ${digits.length} digits; it must have 12.` });
    } else if (!isValidAadhaar(digits)) {
      checks.push({ level: 'error', message: 'Aadhaar number fails the Verhoeff checksum — it cannot be a valid number.' });
    } else {
      checks.push({ level: 'ok', message: 'Aadhaar number is structurally valid (Verhoeff checksum passes).' });
    }
  }

  if (submission.date_of_birth) {
    const dob = new Date(submission.date_of_birth);
    if (Number.isNaN(dob.getTime())) {
      checks.push({ level: 'error', message: 'Date of birth could not be parsed.' });
    } else {
      const now = new Date();
      const age = (now - dob) / (365.2425 * 24 * 3600 * 1000);
      if (age < 0) checks.push({ level: 'error', message: 'Date of birth is in the future.' });
      else if (age > 120) checks.push({ level: 'warn', message: 'Date of birth implies an age above 120.' });
      else checks.push({ level: 'ok', message: `Date of birth is plausible (age ≈ ${Math.floor(age)}).` });
    }
  }

  return checks;
}

/** Pull the JSON payload out of an OpenRouter chat completion. */
function parseModelJson(payload) {
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;

  const text = Array.isArray(content)
    ? content.map((part) => (typeof part === 'string' ? part : part?.text ?? '')).join('')
    : content;

  if (!text || !text.trim()) {
    throw new VerificationError('The model returned an empty response.', 502, {
      finish_reason: choice?.finish_reason,
      raw: payload,
    });
  }

  try {
    return JSON.parse(text);
  } catch {
    // Belt and braces: some models wrap strict JSON in a ```json fence.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        /* fall through */
      }
    }
    throw new VerificationError('The model returned a response that was not valid JSON.', 502, { raw: text.slice(0, 2000) });
  }
}

/**
 * Make sure every submitted field is represented once, in form order, even if the
 * model skipped one. Prevents the UI from silently dropping a field.
 */
function reconcileFieldResults(result, submission) {
  const byField = new Map((result.field_results ?? []).map((r) => [r.field, r]));

  result.field_results = FIELDS.map(({ key }) => {
    const existing = byField.get(key);
    const submitted = submission[key] ? String(submission[key]).trim() : null;
    if (existing) return { ...existing, submitted_value: existing.submitted_value ?? submitted };
    return {
      field: key,
      submitted_value: submitted,
      extracted_value: null,
      verdict: submitted ? 'not_found_on_document' : 'not_submitted',
      confidence: 0,
      reason: 'The model did not report on this field.',
    };
  });

  return result;
}

/**
 * Send the form + document to OpenRouter and return the structured verdict.
 *
 * @param {object} submission  Form values keyed as in schema.js FIELDS.
 * @param {string} image       Data URL (or bare base64 PNG) of the document.
 * @param {object} [options]
 * @param {string} [options.apiKey]
 * @param {string} [options.model]
 * @param {AbortSignal} [options.signal]
 */
export async function verifySubmission(submission, image, options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  const model = options.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  if (!apiKey) {
    throw new VerificationError('OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key.', 500);
  }

  const dataUrl = asDataUrl(image);
  const startedAt = Date.now();

  let response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: options.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/adoistic/aadhaar-form-verifier',
        'X-Title': 'Aadhaar Form Verifier',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: buildUserPrompt(submission) },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: 'json_schema', json_schema: VERIFICATION_SCHEMA },
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new VerificationError(`Could not reach OpenRouter: ${err.message}`, 502);
  }

  const raw = await response.text();

  if (!response.ok) {
    let detail = raw.slice(0, 1000);
    try {
      detail = JSON.parse(raw)?.error?.message ?? detail;
    } catch {
      /* keep the raw text */
    }
    throw new VerificationError(`OpenRouter returned ${response.status}: ${detail}`, response.status === 401 ? 401 : 502);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new VerificationError('OpenRouter returned a non-JSON response.', 502, { raw: raw.slice(0, 1000) });
  }

  const result = reconcileFieldResults(parseModelJson(payload), submission);

  return {
    ...result,
    local_checks: localChecks(submission),
    meta: {
      model: payload.model ?? model,
      latency_ms: Date.now() - startedAt,
      usage: payload.usage ?? null,
    },
  };
}
