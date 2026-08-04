import { formatAadhaar, isValidAadhaar, normalizeAadhaar } from '/lib/aadhaar.js';

const MAX_EDGE = 1600; // px — plenty for OCR, keeps the request body small.

const $ = (id) => document.getElementById(id);

const els = {
  form: $('verify-form'),
  aadhaar: $('aadhaar_number'),
  aadhaarHint: $('aadhaar-hint'),
  dropzone: $('dropzone'),
  fileInput: $('file-input'),
  dropEmpty: $('dropzone-empty'),
  preview: $('preview'),
  previewImg: $('preview-img'),
  previewCaption: $('preview-caption'),
  clearFile: $('clear-file'),
  submit: $('submit-btn'),
  formError: $('form-error'),
  sampleBtn: $('sample-btn'),
  modelPill: $('model-pill'),
  keyPill: $('key-pill'),
  latencyPill: $('latency-pill'),
  placeholder: $('placeholder'),
  loading: $('loading'),
  result: $('result'),
  verdict: $('verdict'),
  verdictTitle: $('verdict-title'),
  verdictConfidence: $('verdict-confidence'),
  summary: $('summary'),
  fieldList: $('field-list'),
  extracted: $('extracted'),
  flagsBlock: $('flags-block'),
  flags: $('flags'),
  checks: $('checks'),
  docNote: $('doc-note'),
  rawJson: $('raw-json'),
};

const FIELD_LABELS = {
  name: 'Full name',
  date_of_birth: 'Date of birth',
  gender: 'Gender',
  address: 'Address',
  aadhaar_number: 'Aadhaar number',
  guardian_name: "Father's / guardian's name",
};

const VERDICT_LABELS = {
  match: 'Details match the document',
  partial_match: 'Mostly matches — review needed',
  mismatch: 'Details do not match',
  undetermined: 'Could not determine',
};

const BADGE_LABELS = {
  match: 'match',
  partial_match: 'partial',
  mismatch: 'mismatch',
  not_found_on_document: 'not on doc',
  not_submitted: 'not given',
};

/** The PNG/JPEG data URL currently staged for upload. */
let documentDataUrl = null;
let samples = null;
let sampleIndex = 0;

// ── Config banner ────────────────────────────────────────────
fetch('/api/config')
  .then((r) => r.json())
  .then((cfg) => {
    els.modelPill.textContent = `model: ${cfg.model}`;
    els.keyPill.textContent = cfg.api_key_configured ? 'key: configured' : 'key: MISSING';
    els.keyPill.classList.add(cfg.api_key_configured ? 'good' : 'bad');
  })
  .catch(() => {
    els.modelPill.textContent = 'model: unknown';
  });

// ── Aadhaar formatting + live checksum ───────────────────────
els.aadhaar.addEventListener('input', () => {
  const digits = normalizeAadhaar(els.aadhaar.value).slice(0, 12);
  els.aadhaar.value = formatAadhaar(digits);

  els.aadhaarHint.classList.remove('ok', 'bad');
  if (digits.length === 0) {
    els.aadhaarHint.textContent = '12 digits. Checked locally against the Verhoeff checksum.';
  } else if (digits.length < 12) {
    els.aadhaarHint.textContent = `${digits.length} of 12 digits.`;
  } else if (isValidAadhaar(digits)) {
    els.aadhaarHint.textContent = 'Checksum passes — structurally a valid Aadhaar number.';
    els.aadhaarHint.classList.add('ok');
  } else {
    els.aadhaarHint.textContent = 'Checksum fails — this cannot be a real Aadhaar number.';
    els.aadhaarHint.classList.add('bad');
  }
});

// ── File handling ────────────────────────────────────────────
els.dropzone.addEventListener('click', () => els.fileInput.click());
els.dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    els.fileInput.click();
  }
});

['dragenter', 'dragover'].forEach((type) =>
  els.dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    els.dropzone.classList.add('dragover');
  }),
);

['dragleave', 'drop'].forEach((type) =>
  els.dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    els.dropzone.classList.remove('dragover');
  }),
);

els.dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files?.[0];
  if (file) handleFile(file);
});

els.clearFile.addEventListener('click', (e) => {
  e.stopPropagation();
  documentDataUrl = null;
  els.fileInput.value = '';
  els.preview.hidden = true;
  els.dropEmpty.hidden = false;
  els.clearFile.hidden = true;
  els.dropzone.classList.remove('has-file');
});

async function handleFile(file) {
  showError(null);
  try {
    const dataUrl =
      file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
        ? await pdfFirstPageToImage(file)
        : await imageFileToDataUrl(file);
    setDocument(dataUrl, `${file.name} · ${(file.size / 1024).toFixed(0)} KB`);
  } catch (err) {
    showError(`Could not read that file: ${err.message}`);
  }
}

function setDocument(dataUrl, caption) {
  documentDataUrl = dataUrl;
  els.previewImg.src = dataUrl;
  els.previewCaption.textContent = caption;
  els.preview.hidden = false;
  els.dropEmpty.hidden = true;
  els.clearFile.hidden = false;
  els.dropzone.classList.add('has-file');
}

/** Read an image file, downscale it if huge, and return a JPEG data URL. */
function imageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('file could not be read'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('not a readable image'));
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

/**
 * Rasterise page 1 of a PDF in the browser. The model only accepts images, so
 * this is where "upload the PDF of your Aadhaar" becomes something it can read.
 */
async function pdfFirstPageToImage(file) {
  const pdfjs = await import('/vendor/pdfjs/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);

  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(3, MAX_EDGE / Math.max(base.width, base.height)) });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff'; // PDFs are transparent; flatten onto white.
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.92);
}

// ── Sample loader ────────────────────────────────────────────
els.sampleBtn.addEventListener('click', async () => {
  showError(null);
  try {
    if (!samples) {
      const res = await fetch('/api/samples');
      if (!res.ok) throw new Error('no fixtures found');
      samples = await res.json();
    }
    if (!samples.length) throw new Error('no fixtures found');

    const sample = samples[sampleIndex % samples.length];
    sampleIndex += 1;

    for (const [key, label] of Object.entries(FIELD_LABELS)) {
      void label;
      const input = document.getElementById(key);
      if (input) input.value = sample.submission[key] ?? '';
    }
    els.aadhaar.dispatchEvent(new Event('input'));

    const res = await fetch(sample.image_url);
    const blob = await res.blob();
    setDocument(await blobToDataUrl(blob), `${sample.id} · expected: ${sample.expected_verdict}`);
    els.sampleBtn.textContent = `Sample ${((sampleIndex - 1) % samples.length) + 1}/${samples.length}`;
  } catch (err) {
    showError(`No synthetic samples available (${err.message}). Run \`npm run synth\` to generate them.`);
  }
});

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('could not read sample'));
    reader.readAsDataURL(blob);
  });
}

// ── Submit ───────────────────────────────────────────────────
els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError(null);

  const data = Object.fromEntries(new FormData(els.form).entries());

  if (!data.name?.trim()) return showError('Enter the applicant’s full name.');
  if (!normalizeAadhaar(data.aadhaar_number)) return showError('Enter the Aadhaar number.');
  if (!documentDataUrl) return showError('Attach a photo or PDF of the Aadhaar card.');

  setBusy(true);
  try {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, image: documentDataUrl }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? `Server returned ${res.status}`);
    render(payload);
  } catch (err) {
    showError(err.message);
    els.placeholder.hidden = false;
    els.result.hidden = true;
  } finally {
    setBusy(false);
  }
});

function setBusy(busy) {
  els.submit.disabled = busy;
  els.submit.textContent = busy ? 'Verifying…' : 'Verify against document';
  els.loading.hidden = !busy;
  if (busy) {
    els.placeholder.hidden = true;
    els.result.hidden = true;
    els.latencyPill.hidden = true;
  }
}

function showError(message) {
  els.formError.hidden = !message;
  els.formError.textContent = message ?? '';
}

// ── Rendering ────────────────────────────────────────────────
function render(r) {
  els.placeholder.hidden = true;
  els.result.hidden = false;

  const verdict = r.overall_verdict ?? 'undetermined';
  els.verdict.className = `verdict ${verdict}`;
  els.verdictTitle.textContent = VERDICT_LABELS[verdict] ?? verdict;
  els.verdictConfidence.textContent = `confidence ${formatPct(r.overall_confidence)}`;
  els.summary.textContent = r.summary ?? '';

  els.fieldList.replaceChildren(...(r.field_results ?? []).map(renderField));

  els.extracted.replaceChildren(
    ...Object.entries(FIELD_LABELS).flatMap(([key, label]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = r.extracted?.[key] ?? '—';
      return [dt, dd];
    }),
  );

  const flags = r.red_flags ?? [];
  els.flagsBlock.hidden = flags.length === 0;
  els.flags.replaceChildren(...flags.map((f) => textNode('li', f)));

  els.checks.replaceChildren(
    ...(r.local_checks ?? []).map((c) => {
      const li = textNode('li', c.message);
      li.className = c.level;
      return li;
    }),
  );

  const doc = r.document_assessment ?? {};
  els.docNote.textContent = `${labelDocType(doc.document_type)} · ${doc.is_legible ? 'legible' : 'not clearly legible'} — ${doc.notes ?? ''}`;

  els.rawJson.textContent = JSON.stringify(r, null, 2);

  if (r.meta) {
    els.latencyPill.hidden = false;
    els.latencyPill.textContent = `${r.meta.model} · ${(r.meta.latency_ms / 1000).toFixed(1)}s`;
  }
}

function renderField(f) {
  const li = document.createElement('li');

  const head = document.createElement('div');
  head.className = 'field-head';
  head.append(textNode('span', FIELD_LABELS[f.field] ?? f.field, 'field-name'));
  head.append(textNode('span', BADGE_LABELS[f.verdict] ?? f.verdict, `badge ${f.verdict}`));
  li.append(head);

  if (f.verdict !== 'not_submitted') {
    const dl = document.createElement('dl');
    dl.className = 'compare';
    for (const [label, value] of [
      ['Entered', f.submitted_value],
      ['On card', f.extracted_value],
    ]) {
      dl.append(textNode('dt', label));
      const dd = textNode('dd', value ?? 'not found');
      if (!value) dd.classList.add('empty');
      dl.append(dd);
    }
    li.append(dl);
  }

  if (f.reason) li.append(textNode('p', f.reason, 'reason'));
  return li;
}

function textNode(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

function formatPct(n) {
  return typeof n === 'number' ? `${Math.round(n * 100)}%` : '—';
}

function labelDocType(type) {
  return (
    {
      aadhaar_card: 'Aadhaar card',
      other_id_document: 'Another kind of ID document',
      not_an_id_document: 'Not an ID document',
      unreadable: 'Unreadable',
    }[type] ?? 'Unknown document'
  );
}
