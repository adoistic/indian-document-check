# Document Check

Two jobs, on Indian government paperwork.

**Check one document.** Somebody hands you an Aadhaar card, a PAN card, a GST certificate. You have their details typed into a form. Do the two agree? Pick the document, add a photo or PDF, type the details or let the app read them off for you, and get a plain answer field by field.

**Sort a pile.** Drop in everything you have — any mix of documents, for any number of people, with nothing labelled. Each file is worked out on its own, then the lot is sorted into who and what they belong to: this man, his shop, the company he directs, and two people who have nothing to do with any of it. Every grouping tells you why.

**Try it: [indian-document-check.appsadoistic.workers.dev](https://indian-document-check.appsadoistic.workers.dev)** — both modes have a ready-made sample; no real document needed.

> Every sample document here is invented. This is a demonstration of document reading — it does not contact any government database, and it cannot tell a good forgery from a real document. Do not put a real ID through it.

---

## The fifteen documents

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
| **Director ID letter** | Ministry of Corporate Affairs | The 8-digit number a person needs to be a director |
| **Certificate of incorporation** | Registrar of Companies | A company's birth certificate, with its 21-character number |
| **Bank passbook** | The account holder's bank | Name, address and bank account on one page |

Each one carries its own fields, its own printed layout, and its own number rules. Adding a sixteenth means one entry in [`public/lib/documents.js`](public/lib/documents.js) — the picker, the form, the prompts, the schema and the sample generator all follow from it.

## What it does

**Reads the document and fills the form in.** Press one button and the printed values land in the fields, highlighted so you can see what was filled for you and correct anything wrong. This is the fastest way to see the thing work: load a sample with nothing typed, press the button, watch the form populate.

**Compares meaning, not characters.** "Rajesh K. Sharma" against "Rajesh Kumar Sharma" comes back as *nearly*. "Sandip" against "Sandeep" — the same name, spelt the other common way — is *nearly*. An address written the short way (`Sunrise Apts, Andheri E`) against the long way (`Sunrise Apartments, Andheri East`) is a clean match. A different PIN code is not.

**Knows the difference between the wrong details and the wrong paper.** Hand over a PAN card when an Aadhaar was asked for and the answer is "this is the wrong document", not a list of mismatched fields. Those are different problems and a clerk needs to tell them apart.

**Checks the numbers itself, without reading anything.** Aadhaar numbers carry a Verhoeff check digit; GST numbers carry a Luhn mod-36 one; PAN encodes the taxpayer type in its 4th character. Those run in JavaScript, live as you type and again on the server, whatever the picture says. A number that fails cannot be real, and you learn that before any document is read.

**Takes PDFs.** Government portals hand out PDFs. Page one is turned into a picture in your browser before anything is sent.

**Refuses to guess.** A blurred photo returns "could not tell", not an invented answer. A field that is not on the page comes back empty rather than filled in from thin air.

**Catches its own misreads.** Aadhaar and GST numbers carry a check digit, so a wrong character can be detected without knowing the right one. When a number fails its own check, the document is read again with attention drawn to that field — and the second reading is only accepted if it passes the check the first one failed. In the benchmark this is what recovers a GST number whose 4th and 5th characters came back transposed, and with it the link between a shop and its owner.

## Sorting a pile

Give it a stack of unlabelled files and it works out what each one is, then who they all belong to.

The grouping is **not** a model's job. It is arithmetic on the values already read off each document, so every grouping comes with a reason you can check yourself:

- **A shared reference number.** The strongest evidence there is. Two documents carrying the same PAN are the same person.
- **A number hidden inside another number.** A GST registration contains its holder's PAN at characters 3–12. When those ten characters match a PAN card in the pile, a shop has been tied to the person who registered it — a link that appears on neither document.
- **Name plus something else.** Six documents can share no reference number at all and still obviously belong to one man. Name agreement alone is never enough; it has to be backed by a date of birth, an address, or a father's name. This is what keeps two different men called Sandeep Joshi apart.
- **Names on someone else's paperwork.** The directors printed on a certificate of incorporation, the owner named on a Udyam certificate.

Name comparison folds the ways the same Indian name gets written in English — Sandeep/Sandip, Venkatesan/Venkateshan, Meenakshi/Meenaakshi — and expands initials, so "Priya V." reaches "Priya Venkatesan".

A person and a company are never merged into one entity, however alike their names. They are linked by a **relationship** instead: *runs*, *director of*, *shares an address with* — each with the reason spelled out.

**Contradictions are raised, not resolved.** The same PAN under two different names, or the same Aadhaar number against two dates of birth, is the thing you most want to be told about. It is reported rather than quietly smoothed over.

Files that are not documents — a shop receipt, a photograph of a wall — are set aside rather than forced into a group.

## Quick start

```bash
git clone https://github.com/adoistic/indian-document-check.git
cd indian-document-check
npm install
cp .env.example .env      # then paste your OpenRouter key into .env
npm run samples && npm run dossier   # draw the sample documents and the benchmark pile
npm start                 # → http://localhost:5285
```

Press **Use a sample instead** at step 2 to try one document, or switch to **Sort a pile** and press **Try a ready-made pile**.

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

1. **Reading** — each of the fifteen documents is read back and compared with what was printed on it. A field left empty is tolerated; a field filled in *wrongly* is a failure, because a confident wrong answer is the dangerous one.
2. **Checking** — thirty-two filled-in forms, each with an expected answer, covering exact matches, abbreviations, spelling variants, single-digit typos, transposed characters, wrong categories, an impostor, a wrong-document swap and a grocery receipt.

```
47/47 checks passed
```

Narrow it down with `npm test -- pan`, or run one half with `--read` / `--check`.

## The benchmark

Sorting a pile is scored rather than admired. `npm run dossier` builds one deliberately awkward stack of thirteen files with the right answer written down beside it, and `npm run bench` scores four things separately, because they fail for different reasons.

The pile is built around the cases that are actually hard:

- **Six documents, no shared number.** Aadhaar, PAN, voter ID, licence, director ID letter and passbook for one man, with no reference number in common. They can only be grouped by name plus date of birth or address.
- **A spelling variant.** One of those six says *Sandip*, not *Sandeep*. It has to land in his group anyway.
- **A same-name decoy.** A second Sandeep Joshi, different date of birth, different town, different father. He must **not** land in that group. This single pair is what separates real matching from string comparison.
- **A link that is on neither document.** His shop's GST number contains his personal PAN, reachable only by pulling ten characters out of the middle of a fifteen-character number.
- **A company that names him.** Findable through the directors printed on the certificate of incorporation.
- **A passbook with no date of birth.** Groups by address instead.
- **A hardware shop receipt.** Must be set aside, not forced into a group.

```
  Identification   100.0%   13/13 files recognised for what they are
  Extraction       100.0%   13/13 reference numbers read exactly
  Grouping         100.0%   F1 · precision 100.0%, recall 100.0%   (16 pairs right, 0 wrongly joined, 0 wrongly split)
                            6 groups found, 6 expected
  Connections      100.0%   2/2 links between people and their businesses
  Set aside        yes      hardware-receipt.png kept out of every group

  13.3s for 13 files
```

Grouping is scored **pairwise**, the standard measure for entity resolution: of all the pairs of documents that belong together, how many were put together, and of the pairs that were put together, how many belonged? Getting the six-document group right is worth 15 pairs; wrongly merging the two men called Sandeep Joshi would cost 6 false positives.

`npm run bench -- --runs 3` repeats it. Three consecutive runs score full marks on all four measures.

`npm run bench -- --logic` scores the grouping alone, fed the printed values as if every read were perfect — no API calls, instant, free. It separates *did we read it right* from *did we group it right*, which is what you want when a score drops and you need to know which half moved.

## The demo film

```bash
npm run video
```

Builds a narrated three-minute walkthrough into `video/build/document-check.mp4`. Four steps, each runnable on its own:

| Step | What it does |
| --- | --- |
| `video/slides.js` | Draws the title, chapter and closing cards as SVG, in the app's own palette |
| `video/narrate.js` | Reads each line of the script aloud, one voice throughout, cached by the text so an edit only re-reads what changed |
| `video/capture.js` | Drives the running app with Playwright and records it, drawing a cursor into the page so the clicks are visible |
| `video/build.js` | Fits every scene to the length of its own line and lays the voice over the top |

The narration sets the timing: a slide is held for exactly as long as its line takes to say, and a recording is stretched or tightened to match, holding on its last frame rather than crawling if it falls short. Nothing can drift out of sync because nothing is timed by hand.

`node video/capture.js pile` re-records one session and keeps the other. Narration needs `KIE_API_KEY` in `.env`; the other three steps need nothing.

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
| [`public/lib/documents.js`](public/lib/documents.js) | The fifteen documents: fields, labels, help text, printed layout |
| [`public/lib/validators.js`](public/lib/validators.js) | Number rules — Verhoeff, Luhn mod 36, PAN, CIN, DIN, IFSC, EPIC, DL, passport, RC |
| [`src/core/schema.js`](src/core/schema.js) | Schemas and prompts, built per document |
| [`src/core/verify.js`](src/core/verify.js) | Reading and checking, plus the checksum-guided re-read |
| [`src/core/identify.js`](src/core/identify.js) | Working out what an unlabelled document is |
| [`src/core/linking.js`](src/core/linking.js) | Grouping a pile by who it belongs to. Pure arithmetic, no model |
| [`src/core/pile.js`](src/core/pile.js) | Orchestrating a whole pile, and putting the result into words |
| [`src/core/api.js`](src/core/api.js) | Routing, shared by both runtimes |
| [`src/server.js`](src/server.js) / [`worker/index.js`](worker/index.js) | Express for local work, a Worker for production |
| [`public/`](public) | The interface — no framework, no build step |
| [`scripts/render/templates.js`](scripts/render/templates.js) | Draws the synthetic documents as SVG |
| [`scripts/generate-synthetic.js`](scripts/generate-synthetic.js) | Builds the samples and the expected answers |

`public/lib/` is shared verbatim between the browser and the server, so the Verhoeff check you see as you type is the same code that runs on the server.

## The synthetic documents

`npm run samples` draws all fifteen from three SVG templates — a plastic ID card, a passport details page, and a printed certificate — with bilingual headers, a photo box, a QR block, a seal and a guilloche background, in the layout of the real thing. Each is stamped `SYNTHETIC SPECIMEN`.

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

```jsonc
// POST /api/sort — a pile of unlabelled files
{ "files": [{ "id": "1.png", "name": "1.png", "image": "data:image/png;base64,…" }] }

// → what each one is, and who they all belong to
{
  "documents":  [{ "id": "1.png", "type": "pan", "typeName": "PAN card", "recognised": true,
                   "certainty": "high", "fields": [{ "key": "name", "label": "Full name", "value": "…" }],
                   "checks": [{ "level": "ok", "message": "…" }] }],
  "entities":   [{ "id": "entity-1", "kind": "person", "name": "Sandeep Joshi",
                   "documents": ["1.png", "…"],
                   "identifiers": [{ "type": "pan", "value": "BXQPJ7412K", "derived": false }],
                   "evidence": ["Same name and the same date of birth (1985-09-09)."] }],
  "relationships": [{ "from_name": "Sandeep Joshi", "to_name": "Joshi Electricals", "kind": "runs",
                      "reason": "The GST number contains the PAN BXQPJ7412K, which is his…" }],
  "conflicts":  [],
  "narrative":  { "headline": "…", "summary": "…", "extra_concerns": [] }
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
