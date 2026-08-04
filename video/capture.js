#!/usr/bin/env node
/**
 * Records the app being used.
 *
 * Two sessions — one for checking a single document, one for sorting a pile —
 * each captured as a single continuous video. Timestamps are noted as the
 * session runs, so the assembly step can cut the recording into the scenes the
 * script asks for.
 *
 * A cursor is drawn into the page and moved before every click, because a
 * browser recording with no pointer looks like the screen is haunted.
 */
import { mkdir, writeFile, readFile, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'build', 'clips');

const SITE = process.env.DEMO_URL ?? 'http://localhost:5285';
// Narrow enough that the app's 1160px column nearly fills the frame. Recorded
// here and scaled up to 1080p later, which is what makes the text readable in
// the finished film — record it wide and everything ends up tiny.
const VIEWPORT = { width: 1280, height: 720 };

/** Drawn into the page so clicks are visible. */
const CURSOR = `
  (() => {
    const dot = document.createElement('div');
    dot.id = '__cursor';
    dot.innerHTML = \`<svg width="26" height="26" viewBox="0 0 26 26">
      <path d="M4 2 L4 20 L9 15.5 L12.5 23 L16 21.5 L12.5 14.5 L19 14 Z"
            fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>\`;
    Object.assign(dot.style, {
      position: 'fixed', left: '0', top: '0', zIndex: '2147483647',
      pointerEvents: 'none', transition: 'transform 520ms cubic-bezier(.4,.1,.2,1)',
      transform: 'translate(760px, 700px)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))',
    });
    document.body.appendChild(dot);

    const ring = document.createElement('div');
    ring.id = '__ring';
    Object.assign(ring.style, {
      position: 'fixed', left: '0', top: '0', width: '30px', height: '30px',
      marginLeft: '-15px', marginTop: '-15px', borderRadius: '50%',
      border: '2px solid #1f5fd6', zIndex: '2147483646', pointerEvents: 'none',
      opacity: '0', transform: 'translate(760px, 700px) scale(.4)',
    });
    document.body.appendChild(ring);

    window.__point = (x, y) => {
      document.getElementById('__cursor').style.transform = \`translate(\${x}px, \${y}px)\`;
      document.getElementById('__ring').style.transform = \`translate(\${x}px, \${y}px) scale(.4)\`;
    };
    window.__tap = () => {
      const r = document.getElementById('__ring');
      r.style.transition = 'none';
      r.style.opacity = '.9';
      r.style.transform = r.style.transform.replace(/scale\\([^)]*\\)/, 'scale(.4)');
      requestAnimationFrame(() => {
        r.style.transition = 'opacity 450ms ease, transform 450ms ease';
        r.style.opacity = '0';
        r.style.transform = r.style.transform.replace(/scale\\([^)]*\\)/, 'scale(1.6)');
      });
    };
  })();`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A session: one browser context, one video, a list of scene timings. */
async function session(name, run) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: VIEWPORT },
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });

  const page = await context.newPage();
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html{scroll-behavior:smooth}' });
  await page.evaluate(CURSOR);

  const t0 = Date.now();
  const marks = [];
  const at = () => (Date.now() - t0) / 1000;

  const helpers = {
    page,
    wait,

    /** Start a scene, run it, and note when it began and ended. */
    async scene(id, body) {
      const start = at();
      await body();
      marks.push({ id, start, end: at() });
    },

    /** Move the drawn cursor over an element, pause, then click it. */
    async click(selector, { pause = 620 } = {}) {
      const box = await page.locator(selector).first().boundingBox();
      if (box) {
        await page.evaluate(([x, y]) => window.__point(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
        await wait(pause);
        await page.evaluate(() => window.__tap());
      }
      await page.locator(selector).first().click();
      await wait(220);
    },

    /** Move the cursor without clicking — used to draw the eye somewhere. */
    async hover(selector) {
      const box = await page.locator(selector).first().boundingBox();
      if (box) await page.evaluate(([x, y]) => window.__point(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
      await wait(420);
    },

    /** Scroll an element into view, gently. */
    async show(selector, block = 'center') {
      await page.evaluate(
        ([sel, b]) => document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: b }),
        [selector, block],
      );
      await wait(900);
    },

    async scrollBy(pixels) {
      await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), pixels);
      await wait(900);
    },
  };

  await wait(700); // a beat of stillness before anything moves
  await run(helpers);
  await wait(600);

  const video = page.video();
  await context.close();
  await browser.close();

  const raw = await video.path();
  const file = path.join(OUT, `${name}.webm`);
  await rename(raw, file);

  console.log(`  · ${name}.webm  ${marks.map((m) => `${m.id} ${m.start.toFixed(1)}–${m.end.toFixed(1)}s`).join('  ')}`);
  return { name, file: `${name}.webm`, marks };
}

// ── Session one: checking a single document ───────────────────────────────

const singleSession = (h) =>
  h.scene('pick', async () => {
    await h.hover('#doc-grid');
    await h.wait(700);
    await h.scrollBy(220);
    await h.hover('[data-id="passport"]');
    await h.wait(500);
    await h.hover('[data-id="gst_certificate"]');
    await h.wait(500);
    await h.scrollBy(-220);
    await h.click('[data-id="aadhaar"]');
    await h.wait(900);
  })
    .then(() =>
      h.scene('fill', async () => {
        await h.show('#step-file', 'start');
        await h.click('#sample-btn');
        await h.wait(900);
        await h.click('.sheet-list button'); // just the document, nothing typed
        await h.wait(1800);
        await h.show('#step-form', 'start');
        await h.click('#read-btn');
        await h.page.waitForFunction(() => !document.getElementById('read-note').hidden, { timeout: 60000 });
        await h.wait(1500);
        await h.scrollBy(260);
        await h.wait(1200);
      }),
    )
    .then(() =>
      h.scene('check', async () => {
        await h.show('#check-btn', 'center');
        await h.click('#check-btn');
        await h.page.waitForFunction(() => !document.getElementById('result').hidden, { timeout: 60000 });
        await h.wait(1200);
        await h.show('#verdict', 'start');
        await h.wait(1600);
        await h.scrollBy(320);
        await h.wait(1400);
        await h.scrollBy(320);
        await h.wait(1200);
      }),
    )
    .then(() =>
      h.scene('wrong', async () => {
        await h.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
        await h.wait(700);
        await h.show('#step-file', 'start');
        await h.click('#sample-btn');
        await h.wait(900);
        // The last snag in the list is the wrong document altogether.
        await h.click('.sheet-list li:nth-last-child(2) button');
        await h.wait(1600);
        await h.show('#check-btn', 'center');
        await h.click('#check-btn');
        await h.page.waitForFunction(() => !document.getElementById('result').hidden, { timeout: 60000 });
        await h.wait(1000);
        await h.show('#verdict', 'start');
        await h.wait(2200);
      }),
    );

// ── Session two: sorting a pile ───────────────────────────────────────────

const pileSession = (h) =>
  h
    .click('#mode-pile')
    .then(() =>
      h.scene('drop', async () => {
        await h.wait(600);
        await h.click('#pile-sample-btn');
        await h.page.waitForFunction(() => document.querySelectorAll('#tray li').length >= 13, { timeout: 90000 });
        await h.wait(1400);
        await h.scrollBy(240);
        await h.wait(1300);
        await h.scrollBy(-240);
        await h.click('#pile-go');
        await h.wait(1800);
      }),
    )
    .then(() =>
      h.scene('entities', async () => {
        await h.page.waitForFunction(() => !document.getElementById('pile-result').hidden, { timeout: 180000 });
        await h.wait(1200);
        await h.show('#pile-headline', 'start');
        await h.wait(2200);
        await h.show('.entity:nth-of-type(1)', 'start');
        await h.wait(2400);
        await h.scrollBy(420);
        await h.wait(1800);
        await h.scrollBy(420);
        await h.wait(1600);
      }),
    )
    .then(() =>
      h.scene('links', async () => {
        await h.show('#rel-block', 'start');
        await h.wait(4200);
        await h.hover('#rels li:nth-child(1)');
        await h.wait(2600);
        await h.hover('#rels li:nth-child(2)');
        await h.wait(2600);
        await h.show('#aside-block', 'start');
        await h.wait(2400);
      }),
    );

async function main() {
  await mkdir(OUT, { recursive: true });

  // `node video/capture.js pile` re-records one session and keeps the other.
  const only = process.argv[2];

  // Clear out only what is about to be recorded again — sweeping the whole
  // directory would take the session we were asked to keep with it.
  for (const entry of await readdir(OUT)) {
    if (!entry.endsWith('.webm')) continue;
    if (only && entry !== `${only}.webm`) continue;
    await rename(path.join(OUT, entry), path.join(OUT, `${entry}.old`)).catch(() => {});
  }

  const previous = await readFile(path.join(OUT, 'index.json'), 'utf8').then(JSON.parse, () => []);

  const sessions = [];
  for (const [name, body] of [['single', singleSession], ['pile', pileSession]]) {
    if (only && name !== only) {
      const kept = previous.find((s) => s.name === name);
      if (kept) {
        sessions.push(kept);
        console.log(`  · ${name}.webm  kept from the last run`);
        continue;
      }
    }
    sessions.push(await session(name, body));
  }

  await writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(sessions, null, 2)}\n`);
  console.log('\nrecordings → video/build/clips\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
