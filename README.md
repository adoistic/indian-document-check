# Aadhaar Form Verifier

A small web app that answers one question: **does what the applicant typed into the form match the Aadhaar card they uploaded?**

You fill in a name, date of birth, gender, address and Aadhaar number, attach a photo or PDF of the card, and the app sends both to a vision model through [OpenRouter](https://openrouter.ai) with a **strict JSON schema**. What comes back is a field-by-field verdict — match, partial match, or mismatch — plus the values the model actually read off the document, so a human reviewer can see exactly what it based the call on.

<sub>Everything in `samples/` is synthetic. This is a demo of structured LLM output, not a UIDAI-authorised identity check.</sub>

---

## What it does

- **Form → document comparison.** Six fields are compared: full name, date of birth, gender, address, Aadhaar number, and father's/guardian's name.
- **Structured output, not prose.** The model is constrained by a strict JSON schema (`additionalProperties: false`, every key required), so the server never parses free text or guesses at a shape.
- **Judgement, not string equality.** "Rajesh K. Sharma" against "Rajesh Kumar Sharma" is a *partial match*; a different PIN code is a *mismatch*; a card printing only a year of birth against a full submitted date is a *partial match*. The rules live in the system prompt in [`src/schema.js`](src/schema.js).
- **PDFs work.** e-Aadhaar downloads are PDFs. The first page is rasterised to an image **in the browser** via pdf.js before anything is sent, so the model always receives an image.
- **A local check the model can't fake.** Aadhaar numbers carry a Verhoeff checksum. The app validates it in JavaScript, live as you type and again on the server, independent of whatever the model says.
- **Refuses to guess.** Upload a grocery receipt and the verdict is `undetermined`, not a hallucinated match.

## Screens

The left panel is the form and the document dropzone; the right panel is the verdict, the per-field comparison, the values read off the card, local checks, and the raw JSON.

## Quick start

```bash
git clone https://github.com/adoistic/aadhaar-form-verifier.git
cd aadhaar-form-verifier
npm install
cp .env.example .env      # then paste your OpenRouter key into .env
npm run synth             # generate the synthetic test cards
npm start                 # → http://localhost:3000
```

Click **Load sample** in the UI to fill the form and attach a matching card in one go; click it again to cycle through the other seven cases.

## Configuration

All configuration is environment variables, read from `.env` (which is git-ignored).

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | — | Required. Get one at [openrouter.ai/keys](https://openrouter.ai/keys). |
| `OPENROUTER_MODEL` | `google/gemini-3.1-flash-lite` | Any OpenRouter model with vision + `json_schema` support. |
| `PORT` | `3000` | |

The key is only ever read server-side; the browser never sees it. The header pill shows whether a key is configured, not the key itself.

## Synthetic test data

`npm run synth` writes eight fabricated e-Aadhaar-style cards to `samples/` (git-ignored), each with a form submission designed to produce a known verdict:

| Case | What it tests | Expected |
| --- | --- | --- |
| `01-exact-match` | Everything typed exactly as printed | `match` |
| `02-abbreviated-middle-name` | "Priya V." vs "Priya Venkatesan", address reworded | `partial_match` |
| `03-wrong-date-of-birth` | DOB off by five years | `mismatch` |
| `04-aadhaar-digit-typo` | One digit of the number wrong | `mismatch` |
| `05-different-address` | Different city and PIN entirely | `mismatch` |
| `06-year-of-birth-only` | Card prints a year; form gives a full date inside it | `partial_match` |
| `07-impostor` | A different person's details against the card | `mismatch` |
| `08-not-an-id-document` | A grocery receipt uploaded instead | `undetermined` |

Case 01 is also written as `01-exact-match.pdf` so the PDF path has a fixture.

The names, addresses and numbers are invented. The Aadhaar numbers are generated to pass the Verhoeff checksum — that makes them *structurally* well-formed and nothing more; they are not issued to anyone. Every card is stamped `SYNTHETIC SPECIMEN`.

## Running the checks

```bash
npm run test:verify
```

This sends all eight fixtures through the real pipeline and compares the model's verdict against the expected one. It makes live API calls (a fraction of a cent per run).

```
  01-exact-match                PASS  expected match          got match          2.9s
  02-abbreviated-middle-name    PASS  expected partial_match  got partial_match  3.4s
  03-wrong-date-of-birth        PASS  expected mismatch       got mismatch       3.2s
  04-aadhaar-digit-typo         PASS  expected mismatch       got mismatch       3.6s
  05-different-address          PASS  expected mismatch       got mismatch       3.3s
  06-year-of-birth-only         PASS  expected partial_match  got partial_match  3.2s
  07-impostor                   PASS  expected mismatch       got mismatch       2.9s
  08-not-an-id-document         PASS  expected undetermined   got undetermined   3.3s

8/8 cases matched the expected verdict
```

Pass a substring to run a subset: `npm run test:verify -- 04`.

## How it works

```
browser                          server                      OpenRouter
───────                          ──────                      ──────────
form + file
  │
  ├─ PDF? → pdf.js renders p.1 to a canvas
  ├─ image? → downscale to ≤1600px, JPEG
  │
  └─ POST /api/verify ──────────►  validates + builds prompt
     { …fields, image: dataURL }   ├─ system prompt (comparison rules)
                                   ├─ user text (the submitted fields)
                                   ├─ image_url (data URL)
                                   └─ response_format: json_schema ──►  model reads
                                                                        the card
                                   ◄──────────────── strict JSON ───────┘
                                   + Verhoeff / date sanity checks
     ◄─── verdict JSON ────────────┘
```

### Layout

| Path | What lives there |
| --- | --- |
| [`src/schema.js`](src/schema.js) | The JSON schema and the system prompt — the comparison rules are here |
| [`src/verify.js`](src/verify.js) | The OpenRouter call, response parsing, and the local checks |
| [`src/aadhaar.js`](src/aadhaar.js) | Verhoeff checksum; shared verbatim between server and browser |
| [`src/server.js`](src/server.js) | Express routes |
| [`public/`](public) | The UI — no framework, no build step |
| [`scripts/generate-synthetic.js`](scripts/generate-synthetic.js) | Draws the synthetic cards as SVG and rasterises them with sharp |
| [`scripts/test-verify.js`](scripts/test-verify.js) | The fixture runner |

### The API

`POST /api/verify`

```jsonc
// request
{
  "name": "Rajesh Kumar Sharma",
  "date_of_birth": "1988-04-17",
  "gender": "Male",
  "address": "H.No 42, Gandhi Nagar, Sector 9, Rohini, New Delhi, Delhi - 110085",
  "aadhaar_number": "2484 1692 4902",
  "guardian_name": "Mahesh Chand Sharma",
  "image": "data:image/jpeg;base64,…"     // an image, not a PDF
}
```

```jsonc
// response (abridged)
{
  "document_assessment": { "document_type": "aadhaar_card", "is_legible": true, "notes": "…" },
  "extracted":  { "name": "Rajesh Kumar Sharma", "date_of_birth": "1988-04-17", "…": "…" },
  "field_results": [
    { "field": "name", "submitted_value": "Rajesh Kumar Sharma",
      "extracted_value": "Rajesh Kumar Sharma", "verdict": "match",
      "confidence": 1, "reason": "The names match exactly." }
  ],
  "overall_verdict": "match",
  "overall_confidence": 1,
  "summary": "All submitted details match the information on the provided Aadhaar card.",
  "red_flags": [],
  "local_checks": [{ "level": "ok", "message": "Aadhaar number is structurally valid…" }],
  "meta": { "model": "google/gemini-3.1-flash-lite", "latency_ms": 2871, "usage": { "…": "…" } }
}
```

`GET /api/config` reports the active model and whether a key is set. `GET /api/samples` lists the synthetic fixtures, if generated.

## Limitations

Worth being blunt about these:

- **This is not identity verification.** It compares a form against a picture. It does not check the number against UIDAI, does not verify the QR code's signature, and cannot tell a good forgery from a real card. Nothing here should gate access to anything that matters.
- **The model can be wrong.** Verdicts vary with image quality, and a vision model reading a blurry photo will sometimes misread a digit. The per-field reasons and raw JSON are exposed precisely so a human can overrule it.
- **Only page one of a PDF is read**, and only the first attached file.
- **Uploaded documents go to a third party.** The image is sent to OpenRouter and on to the model provider. Do not put real Aadhaar cards through this.
- **No persistence, no auth, no rate limiting.** It is a demo. Do not expose it to the internet as-is.

## Licence

MIT — see [LICENSE](LICENSE).
