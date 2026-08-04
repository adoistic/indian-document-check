import { DOCUMENTS, getDocument } from '/lib/documents.js';
import { NUMBER_FORMATTERS, checkNumber } from '/lib/validators.js';

const MAX_EDGE = 1600; // Big enough to read small print, small enough to send quickly.

const $ = (id) => document.getElementById(id);

const el = {
  howBtn: $('how-btn'),
  howPanel: $('how-panel'),
  docGrid: $('doc-grid'),
  stepFile: $('step-file'),
  stepForm: $('step-form'),
  fileLede: $('file-lede'),
  dropzone: $('dropzone'),
  fileInput: $('file-input'),
  dropEmpty: $('drop-empty'),
  preview: $('preview'),
  previewImg: $('preview-img'),
  previewCaption: $('preview-caption'),
  clearFile: $('clear-file'),
  sampleBtn: $('sample-btn'),
  readBtn: $('read-btn'),
  readBtnLabel: $('read-btn-label'),
  readNote: $('read-note'),
  form: $('check-form'),
  fields: $('fields'),
  checkBtn: $('check-btn'),
  formError: $('form-error'),
  empty: $('empty'),
  busy: $('busy'),
  busyText: $('busy-text'),
  result: $('result'),
  verdict: $('verdict'),
  verdictIcon: $('verdict-icon'),
  verdictTitle: $('verdict-title'),
  verdictSummary: $('verdict-summary'),
  fieldList: $('field-list'),
  readout: $('readout'),
  concernsBlock: $('concerns-block'),
  concerns: $('concerns'),
  checksBlock: $('checks-block'),
  checks: $('checks'),
  raw: $('raw'),
};

const VERDICT = {
  match: { title: 'Everything matches', icon: '✓' },
  partial_match: { title: 'Close, but not exact', icon: '!' },
  mismatch: { title: 'Some details do not match', icon: '✕' },
  wrong_document: { title: 'This is the wrong document', icon: '✕' },
  undetermined: { title: 'Could not tell', icon: '?' },
};

const STATE_WORDS = {
  match: 'Matches',
  partial_match: 'Nearly',
  mismatch: 'Does not match',
  not_found_on_document: 'Not on the document',
  not_submitted: 'You left this blank',
};

let currentDoc = null;
let documentImage = null;
let manifest = null;

// ── How-it-works panel ───────────────────────────────────────
el.howBtn.addEventListener('click', () => {
  const open = el.howPanel.hidden;
  el.howPanel.hidden = !open;
  el.howBtn.setAttribute('aria-expanded', String(open));
  el.howBtn.textContent = open ? 'Hide' : 'How this works';
});

// ── Step 1: pick a document ──────────────────────────────────
for (const doc of DOCUMENTS) {
  const option = document.createElement('button');
  option.type = 'button';
  option.className = 'doc-option';
  option.setAttribute('role', 'radio');
  option.setAttribute('aria-checked', 'false');
  option.dataset.id = doc.id;

  option.append(node('strong', doc.name), node('span', doc.blurb));

  const tags = document.createElement('div');
  tags.className = 'doc-proves';
  for (const proof of doc.proves) tags.append(node('span', proof, 'tag'));
  option.append(tags);

  option.addEventListener('click', () => selectDocument(doc.id));
  el.docGrid.append(option);
}

function selectDocument(id) {
  currentDoc = getDocument(id);

  for (const option of el.docGrid.children) {
    option.setAttribute('aria-checked', String(option.dataset.id === id));
  }

  el.stepFile.hidden = false;
  el.stepForm.hidden = false;
  // Names are used as written — lowercasing turns "GST" into "gst".
  el.fileLede.textContent = `Take a photo of the ${currentDoc.name}, or drop in a scan or PDF.`;
  el.readBtnLabel.textContent = `Read the ${currentDoc.name} and fill this in`;

  buildForm(currentDoc);
  clearFile();
  resetResult();
  el.stepFile.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Step 3: build the form for the chosen document ───────────
function buildForm(doc) {
  el.fields.replaceChildren();
  el.readNote.hidden = true;

  // Dates and dropdowns are short, so put two of them on a line where we can.
  const queue = [...doc.fields];
  while (queue.length) {
    const field = queue.shift();
    const isShort = field.type === 'date' || field.type === 'select';
    const partner = isShort && queue[0] && (queue[0].type === 'date' || queue[0].type === 'select') ? queue.shift() : null;

    if (partner) {
      const pair = document.createElement('div');
      pair.className = 'field-pair';
      pair.append(fieldBlock(field), fieldBlock(partner));
      el.fields.append(pair);
    } else {
      el.fields.append(fieldBlock(field));
    }
  }
}

function fieldBlock(field) {
  const block = document.createElement('div');
  block.className = 'field';

  const label = document.createElement('label');
  label.htmlFor = field.key;
  label.append(document.createTextNode(field.label));
  if (field.optional) label.append(node('span', ' — optional', 'optional'));
  block.append(label);

  let input;
  if (field.type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 3;
  } else if (field.type === 'select') {
    input = document.createElement('select');
    input.append(new Option('—', ''));
    for (const option of field.options) input.append(new Option(option, option));
  } else {
    input = document.createElement('input');
    input.type = field.type === 'date' ? 'date' : 'text';
    input.autocomplete = 'off';
  }

  input.id = field.key;
  input.name = field.key;
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.mono) input.classList.add('mono');
  block.append(input);

  const help = node('p', field.help ?? '', 'help');
  help.id = `${field.key}-help`;
  if (!field.help) help.hidden = true;
  block.append(help);

  // As the number is typed, tidy it and say straight away if it cannot be real.
  const format = NUMBER_FORMATTERS[field.key];
  if (format || checkNumber(field.key, 'probe') !== null) {
    input.addEventListener('input', () => {
      if (format) {
        const caretAtEnd = input.selectionStart === input.value.length;
        input.value = format(input.value);
        if (caretAtEnd) input.setSelectionRange(input.value.length, input.value.length);
      }
      input.classList.remove('filled-in');
      showNumberHelp(field, input, help);
    });
  } else {
    input.addEventListener('input', () => input.classList.remove('filled-in'));
  }

  return block;
}

function showNumberHelp(field, input, help) {
  const result = checkNumber(field.key, input.value);
  help.classList.remove('good', 'bad');

  if (!result) {
    help.textContent = field.help ?? '';
    help.hidden = !field.help;
    return;
  }

  help.hidden = false;
  help.textContent = result.message;
  help.classList.add(result.ok ? 'good' : 'bad');
}

// ── Step 2: the file ─────────────────────────────────────────
el.dropzone.addEventListener('click', () => el.fileInput.click());
el.dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    el.fileInput.click();
  }
});

for (const type of ['dragenter', 'dragover']) {
  el.dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    el.dropzone.classList.add('dragover');
  });
}

for (const type of ['dragleave', 'drop']) {
  el.dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    el.dropzone.classList.remove('dragover');
  });
}

el.dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

el.fileInput.addEventListener('change', () => {
  const file = el.fileInput.files?.[0];
  if (file) handleFile(file);
});

el.clearFile.addEventListener('click', (e) => {
  e.stopPropagation();
  clearFile();
});

function clearFile() {
  documentImage = null;
  el.fileInput.value = '';
  el.preview.hidden = true;
  el.dropEmpty.hidden = false;
  el.clearFile.hidden = true;
  el.dropzone.classList.remove('filled');
  el.readBtn.disabled = false;
}

async function handleFile(file) {
  showError(null);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  try {
    if (isPdf) setBusy('Turning the PDF into a picture…');
    const dataUrl = isPdf ? await pdfFirstPage(file) : await imageToDataUrl(file);
    setDocumentImage(dataUrl, `${file.name} · ${(file.size / 1024).toFixed(0)} KB`);
  } catch (err) {
    showError(`That file could not be opened: ${err.message}`);
  } finally {
    setBusy(null);
  }
}

function setDocumentImage(dataUrl, caption) {
  documentImage = dataUrl;
  el.previewImg.src = dataUrl;
  el.previewCaption.textContent = caption;
  el.preview.hidden = false;
  el.dropEmpty.hidden = true;
  el.clearFile.hidden = false;
  el.dropzone.classList.add('filled');
}

/** Read an image and shrink it if it is enormous. */
function imageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('the file could not be read'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('it is not a picture we can open'));
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 1.5 * 1024 * 1024) return resolve(reader.result);

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Documents downloaded from government portals are PDFs; turn page one into a picture. */
async function pdfFirstPage(file) {
  const pdfjs = await import('/vendor/pdfjs/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1);

  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(3, MAX_EDGE / Math.max(base.width, base.height)) });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.92);
}

// ── Samples ──────────────────────────────────────────────────
el.sampleBtn.addEventListener('click', async () => {
  showError(null);
  try {
    if (!manifest) {
      const res = await fetch('/samples/index.json');
      if (!res.ok) throw new Error('the sample documents have not been generated');
      manifest = await res.json();
    }
    openSampleSheet();
  } catch (err) {
    showError(`No samples available — ${err.message}.`);
  }
});

function openSampleSheet() {
  const entry = manifest.documents[currentDoc.id];
  const cases = manifest.cases.filter((c) => c.document === currentDoc.id);

  const sheet = document.createElement('dialog');
  sheet.className = 'sheet';

  const inner = document.createElement('div');
  inner.className = 'sheet-inner';
  inner.append(
    node('h3', `Sample ${currentDoc.name}`),
    node('p', 'A made-up document, so you can try this without a real one. Pick how you want to start.', 'lede'),
  );

  const list = document.createElement('ul');
  list.className = 'sheet-list';

  const options = [
    {
      title: 'Just the document',
      note: 'Nothing filled in — a good way to try the read-and-fill button.',
      run: () => useSample(entry.image, 'Sample document', null),
    },
    ...cases.map((testCase) => ({
      title: testCase.id.endsWith('-match') ? 'Document and correct details' : `Document, with a snag: ${lowerFirst(testCase.label)}`,
      note: `Expected answer: ${VERDICT[testCase.expected_verdict].title.toLowerCase()}.`,
      run: () => useSample(testCase.image, testCase.label, testCase.submission),
    })),
  ];

  if (entry.pdf) {
    options.push({
      title: 'The same document as a PDF',
      note: 'Tries the PDF route — it is turned into a picture in your browser.',
      run: () => useSample(entry.pdf, 'Sample PDF', null),
    });
  }

  for (const option of options) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.append(node('strong', option.title), node('span', option.note));
    button.addEventListener('click', async () => {
      sheet.close();
      await option.run();
    });
    item.append(button);
    list.append(item);
  }

  inner.append(list);

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'link-btn';
  cancel.style.marginTop = '14px';
  cancel.textContent = 'Never mind';
  cancel.addEventListener('click', () => sheet.close());
  inner.append(cancel);

  sheet.append(inner);
  sheet.addEventListener('close', () => sheet.remove());
  document.body.append(sheet);
  sheet.showModal();
}

async function useSample(file, caption, submission) {
  setBusy('Fetching the sample…');
  try {
    const res = await fetch(`/samples/${file}`);
    const blob = await res.blob();

    if (file.endsWith('.pdf')) {
      setDocumentImage(await pdfFirstPage(new File([blob], file, { type: 'application/pdf' })), `${caption} (PDF)`);
    } else {
      setDocumentImage(await blobToDataUrl(blob), caption);
    }

    resetResult();
    if (submission) {
      fillForm(submission);
      note(`Filled in with the sample details: ${lowerFirst(caption)}.`, false);
    } else {
      clearForm();
      el.readNote.hidden = true;
    }
  } catch (err) {
    showError(`Could not load that sample: ${err.message}`);
  } finally {
    setBusy(null);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('the sample could not be read'));
    reader.readAsDataURL(blob);
  });
}

// ── Read the document and fill the form ──────────────────────
el.readBtn.addEventListener('click', async () => {
  showError(null);
  if (!documentImage) return showError('Add the document first, then it can be read.');

  el.readBtn.disabled = true;
  setBusy('Reading the document…');

  try {
    const res = await fetch('/api/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: currentDoc.id, image: documentImage }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? 'the document could not be read');

    const assessment = payload.document_assessment ?? {};
    if (assessment.document_type !== 'expected_document') {
      note(`That does not look like ${aOrAn(currentDoc.name)}. ${assessment.notes ?? ''}`.trim(), true);
      return;
    }

    const found = fillForm(payload.extracted);
    if (found === 0) note('Nothing could be read from that picture. Try a clearer one.', true);
    else note(`Filled in ${found} ${found === 1 ? 'detail' : 'details'} from the document. Check them and correct anything that is wrong.`, false);
  } catch (err) {
    note(err.message, true);
  } finally {
    el.readBtn.disabled = false;
    setBusy(null);
  }
});

/** Puts values into the form and marks what was filled in for you. */
function fillForm(values) {
  let filled = 0;

  for (const field of currentDoc.fields) {
    const input = $(field.key);
    if (!input) continue;

    const value = values?.[field.key];
    if (value === null || value === undefined || value === '') {
      input.value = '';
      input.classList.remove('filled-in');
      continue;
    }

    // A date input rejects a bare year, so fall back to the 1st of January.
    input.value = field.type === 'date' && /^\d{4}$/.test(String(value)) ? `${value}-01-01` : String(value);
    input.classList.add('filled-in');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.classList.add('filled-in'); // the input handler clears it; this is a fill, so keep it
    filled += 1;
  }

  return filled;
}

function clearForm() {
  for (const field of currentDoc.fields) {
    const input = $(field.key);
    if (input) {
      input.value = '';
      input.classList.remove('filled-in');
    }
  }
}

function note(message, isBad) {
  el.readNote.hidden = false;
  el.readNote.textContent = message;
  el.readNote.classList.toggle('bad', Boolean(isBad));
}

// ── Check ────────────────────────────────────────────────────
el.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError(null);

  if (!documentImage) return showError('Add the document first.');

  const body = { document: currentDoc.id, image: documentImage };
  for (const field of currentDoc.fields) body[field.key] = $(field.key)?.value ?? '';

  const missing = currentDoc.fields.filter((f) => f.required && !String(body[f.key]).trim());
  if (missing.length) return showError(`Still needed: ${missing.map((f) => f.label.toLowerCase()).join(', ')}.`);

  el.checkBtn.disabled = true;
  el.checkBtn.textContent = 'Checking…';
  setBusy('Comparing the details with the document…');

  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? 'the check could not be completed');
    render(payload);
  } catch (err) {
    showError(err.message);
    resetResult();
  } finally {
    el.checkBtn.disabled = false;
    el.checkBtn.textContent = 'Check the details';
    setBusy(null);
  }
});

// ── Result ───────────────────────────────────────────────────
function render(result) {
  el.empty.hidden = true;
  el.result.hidden = false;

  const verdict = result.overall_verdict ?? 'undetermined';
  const words = VERDICT[verdict] ?? VERDICT.undetermined;

  el.verdict.className = `verdict ${verdict}`;
  el.verdictIcon.textContent = words.icon;
  el.verdictTitle.textContent = words.title;
  el.verdictSummary.textContent = result.summary ?? '';

  el.fieldList.replaceChildren(...(result.field_results ?? []).map(fieldRow));

  el.readout.replaceChildren(
    ...currentDoc.fields.flatMap((field) => [
      node('dt', field.label),
      node('dd', result.extracted?.[field.key] || 'not on the document'),
    ]),
  );

  const concerns = result.concerns ?? [];
  el.concernsBlock.hidden = concerns.length === 0;
  el.concerns.replaceChildren(...concerns.map((c) => node('li', c)));

  const checks = result.local_checks ?? [];
  el.checksBlock.hidden = checks.length === 0;
  el.checks.replaceChildren(
    ...checks.map((c) => {
      const li = node('li', c.message);
      li.className = c.level;
      return li;
    }),
  );

  el.raw.textContent = JSON.stringify(result, null, 2);
  el.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function fieldRow(entry) {
  const li = document.createElement('li');
  li.className = entry.verdict;

  const top = document.createElement('div');
  top.className = 'field-top';
  top.append(node('strong', entry.label ?? entry.field), node('span', STATE_WORDS[entry.verdict] ?? entry.verdict, `state ${entry.verdict}`));
  li.append(top);

  if (entry.verdict === 'mismatch' || entry.verdict === 'partial_match') {
    const dl = document.createElement('dl');
    dl.className = 'side-by-side';
    for (const [label, value] of [
      ['You typed', entry.submitted_value],
      ['Document says', entry.extracted_value],
    ]) {
      dl.append(node('dt', label));
      const dd = node('dd', value || 'nothing');
      if (!value) dd.classList.add('blank');
      dl.append(dd);
    }
    li.append(dl);
  }

  if (entry.reason) li.append(node('p', entry.reason, 'field-why'));
  return li;
}

function resetResult() {
  el.result.hidden = true;
  el.empty.hidden = false;
}

// ── Odds and ends ────────────────────────────────────────────
function setBusy(message) {
  el.busy.hidden = !message;
  if (message) {
    el.busyText.textContent = message;
    el.empty.hidden = true;
    el.result.hidden = true;
  } else if (el.result.hidden) {
    el.empty.hidden = false;
  }
}

function showError(message) {
  el.formError.hidden = !message;
  el.formError.textContent = message ?? '';
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

const lowerFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const aOrAn = (word) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

// Tell the visitor straight away if this copy cannot read documents.
fetch('/api/config')
  .then((r) => r.json())
  .then((cfg) => {
    if (!cfg.ready) showError('This demonstration has not been set up with the key it needs, so documents cannot be read.');
  })
  .catch(() => {});
