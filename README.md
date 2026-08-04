# Document Check

Somebody hands you an Aadhaar card, a PAN card, a ration card, a GST certificate. You have their details typed into a form. **Do the two agree?**

That is the whole app. Pick which of twelve Indian government documents you have, add a photo, a scan or a PDF of it, and either type the details or let the app read them off the document for you. Press check and you get a plain answer, field by field, alongside what the document actually says.

> Every sample document here is invented. This is a demonstration of document reading — it does not contact any government database, and it cannot tell a good forgery from a real document. Do not put a real ID through it.

---

## The twelve documents

Chosen to span what Indians actually get asked for — the RBI's officially valid documents for KYC, plus the business, welfare and health registrations that come up alongside them.

| Document | Issued by | What it is for |
| --- | --- | --- |
| **Aadhaar card** | UIDAI | The 12-digit number nearly everyone has |
| **PAN card** | Income Tax Department | The tax card — banks, returns, large payments |
| **Driving licence** | Regional Transport Office | Permission to drive, and a common address proof |
| **Passport** | Ministry of External Affairs | The strongest identity and nationality proof |
| **Voter ID (EPIC)** | Election Commission of India | The card you vote with |
| **Vehicle registration certificate** | Regional Transport Office | Who owns a vehicle, and which vehicle |
| **Ration card** | State food & civil supplies | Subsidised food, and who is in the household |
| **Birth certificate** | Registrar of Births and Deaths | The original record of a birth |
| **GST registration certificate** | GSTN | That a business is registered to trade |
| **Udyam (MSME) certificate** | Ministry of MSME | A small business, registered for schemes and loans |
| **MGNREGA job card** | Ministry of Rural Development | A rural household's right to paid work |
| **ABHA health card** | National Health Authority | The health account that links medical records |

Each one carries its own fields, its own printed layout, and its own number rules. Adding a thirteenth means one entry in [`public/lib/documents.js`](public/lib/documents.js) — the picker, the form, the prompts, the schema and the sample generator all follow from it.

## What it does

**Reads the document and fills the form in.** Press one button and the printed values land in the fields, highlighted so you can see what was filled for you and correct anything wrong. This is the fastest way to see the thing work: load a sample with nothing typed, press the button, watch the form populate.

**Compares meaning, not characters.** "Rajesh K. Sharma" against "Rajesh Kumar Sharma" comes back as *nearly*. "Sandip" against "Sandeep" — the same name, spelt the other common way — is *nearly*. An address written the short way (`Sunrise Apts, Andheri E`) against the long way (`Sunrise Apartments, Andheri East`) is a clean match. A different PIN code is not.

**Knows the difference between the wrong details and the wrong paper.** Hand over a PAN card when an Aadhaar was asked for and the answer is "this is the wrong document", not a list of mismatched fields. Those are different problems and a clerk needs to tell them apart.

**Checks the numbers itself, without reading anything.** Aadhaar numbers carry a Verhoeff check digit; GST numbers carry a Luhn mod-36 one; PAN encodes the taxpayer type in its 4th character. Those run in JavaScript, live as you type and again on the server, whatever the picture says. A number that fails cannot be real, and you learn that before any document is read.

**Takes PDFs.** Government portals hand out PDFs. Page one is turned into a picture in your browser before anything is sent.

**Refuses to guess.** A blurred photo returns "could not tell", not an invented answer. A field that is not on the page comes back empty rather than filled in from thin air.

## Quick start

```bash
git clone https://github.com/adoistic/indian-document-check.git
cd indian-document-check
npm install
cp .env.example .env      # then paste your OpenRouter key into .env
npm run samples           # draw the twelve synthetic documents
npm start                 # → http://localhost:5285
```

Press **Use a sample instead** at step 2 to try it without a real document.

## Configuration

Environment variables, read from `.env` locally (git-ignored) and from Worker secrets in production.

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | — | Required. Get one at [openrouter.ai/keys](https://openrouter.ai/keys). |
| `OPENROUTER_MODEL` | `google/gemini-3.1-flash-lite` | Any vision model that supports `json_schema` responses. |
| `PORT` | `5285` | Local server only. |

The key is only ever read server-side. Nothing in the interface names the model, the provider or the API — a person using it should not have to care.

## Deploying to Cloudflare

The same handlers run in a Worker; static files come from `./public` via the assets binding.

```bash
npx wrangler secret put OPENROUTER_API_KEY
npm run cf:deploy
```

`npm run cf:dev` runs the Worker locally on the same port. Both commands copy the PDF reader into `public/vendor` first, since Cloudflare only uploads what is inside `public`.

## Testing

```bash
npm test
```

Two suites, both against the real pipeline:

1. **Reading** — each of the twelve documents is read back and compared with what was printed on it. A field left empty is tolerated; a field filled in *wrongly* is a failure, because a confident wrong answer is the dangerous one.
2. **Checking** — twenty-six filled-in forms, each with an expected answer, covering exact matches, abbreviations, spelling variants, single-digit typos, wrong categories, an impostor, a wrong-document swap and a grocery receipt.

```
38/38 checks passed
```

Narrow it down with `npm test -- pan`, or run one half with `--read` / `--check`.

## How it works

```
browser                        server / worker              reading service
───────                        ───────────────              ───────────────
pick a document
add a file
  ├─ PDF?  → pdf.js renders page 1 to a canvas
  ├─ image → downscale to ≤1600px
  │
  ├─ POST /api/read ────────►  extraction prompt + strict schema  ──►  reads
  │  ◄───── printed values ──  normalise dates                    ◄──  the page
  │  fills the form in
  │
  └─ POST /api/check ───────►  comparison prompt + strict schema  ──►  compares
                               + Verhoeff / Luhn / date checks    ◄──
     ◄───── the answer ───────  run locally, no network
```

Both requests are constrained by a JSON schema generated from the chosen document — every key required, no extra keys allowed — so the server never parses prose or guesses at a shape.

| Path | What lives there |
| --- | --- |
| [`public/lib/documents.js`](public/lib/documents.js) | The twelve documents: fields, labels, help text, printed layout |
| [`public/lib/validators.js`](public/lib/validators.js) | Number rules — Verhoeff, Luhn mod 36, PAN, EPIC, DL, passport, RC |
| [`src/core/schema.js`](src/core/schema.js) | Schemas and prompts, built per document |
| [`src/core/verify.js`](src/core/verify.js) | The two calls, plus the local checks |
| [`src/core/api.js`](src/core/api.js) | Routing, shared by both runtimes |
| [`src/server.js`](src/server.js) / [`worker/index.js`](worker/index.js) | Express for local work, a Worker for production |
| [`public/`](public) | The interface — no framework, no build step |
| [`scripts/render/templates.js`](scripts/render/templates.js) | Draws the synthetic documents as SVG |
| [`scripts/generate-synthetic.js`](scripts/generate-synthetic.js) | Builds the samples and the expected answers |

`public/lib/` is shared verbatim between the browser and the server, so the Verhoeff check you see as you type is the same code that runs on the server.

## The synthetic documents

`npm run samples` draws all twelve from three SVG templates — a plastic ID card, a passport details page, and a printed certificate — with bilingual headers, a photo box, a QR block, a seal and a guilloche background, in the layout of the real thing. Each is stamped `SYNTHETIC SPECIMEN`.

The people, businesses, addresses and numbers are invented. ID numbers are generated to pass their own format rules, which exercises the local validation — it makes them well-formed, not issued to anybody.

## The API

Two endpoints, both taking JSON.

```jsonc
// POST /api/read — read a document
{ "document": "pan", "image": "data:image/jpeg;base64,…" }

// → what is printed on it, ready to drop into the form
{
  "document_assessment": { "document_type": "expected_document", "is_legible": true, "notes": "…" },
  "extracted": { "name": "Priya Venkatesan", "father_name": "S Venkatesan",
                 "date_of_birth": "1995-11-02", "pan_number": "ABCPV1234K" }
}
```

```jsonc
// POST /api/check — compare a filled form against the document
{ "document": "pan", "name": "Priya Venkatesan", "pan_number": "ABCPV1234K",
  "image": "data:image/jpeg;base64,…" }

// → the answer
{
  "overall_verdict": "match",            // match | partial_match | mismatch | wrong_document | undetermined
  "summary": "Everything on the form matches the card.",
  "field_results": [{ "field": "name", "label": "Full name", "important": true,
                      "submitted_value": "…", "extracted_value": "…",
                      "verdict": "match", "reason": "The names match exactly." }],
  "extracted": { "…": "…" },
  "concerns": [],
  "local_checks": [{ "level": "ok", "message": "The PAN is in the right shape…" }]
}
```

`GET /api/documents` lists the supported documents and their fields.

## Limitations

- **This is not identity verification.** It compares a form against a picture. No UIDAI lookup, no QR signature check, no forgery detection. Nothing here should gate access to anything that matters.
- **The reading can be wrong.** Quality varies with the photo. The per-field reasons, the full record and the "what the document says" panel exist so a person can overrule it.
- **Only page one of a PDF**, and only the first file attached.
- **Documents leave your machine.** The picture is sent to a third-party reading service. Do not send real IDs.
- **No accounts, no storage, no rate limiting.** It is a demonstration.

## Licence

MIT — see [LICENSE](LICENSE).
