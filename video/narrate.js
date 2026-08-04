#!/usr/bin/env node
/**
 * Turns each line of the script into audio, one file per scene.
 *
 * Every line goes through the same single speaker configuration, so the voice
 * is the same person from the first word to the last. Results are cached by the
 * text itself — change a line and only that line is regenerated.
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import { SCENES, VOICE, VOICE_CONTEXT } from './script.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'build', 'audio');

const API = 'https://api.kie.ai/api/v1/jobs';
const MODEL = 'google/gemini-3-1-flash-tts';

const key = process.env.KIE_API_KEY;
if (!key) {
  console.error('KIE_API_KEY is not set. Add it to .env — it is git-ignored.');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (file) => access(file).then(() => true, () => false);

/** The cache key covers everything that changes how a line sounds. */
const fingerprint = (text) => createHash('sha1').update(JSON.stringify([text, VOICE, VOICE_CONTEXT, MODEL])).digest('hex').slice(0, 12);

async function speak(text) {
  const created = await fetch(`${API}/createTask`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      input: {
        speakers: [{ speaker_id: 'Speaker 1', ...VOICE }],
        dialogue_turns: [{ speaker_id: 'Speaker 1', text }],
        sample_context: VOICE_CONTEXT,
        temperature: 0.6,
      },
    }),
  }).then((r) => r.json());

  if (created.code !== 200) throw new Error(`could not start: ${created.msg}`);
  const taskId = created.data.taskId;

  for (let attempt = 0; attempt < 80; attempt++) {
    await sleep(2500);
    const status = await fetch(`${API}/recordInfo?taskId=${taskId}`, { headers }).then((r) => r.json());
    const data = status.data;
    if (!data) continue;
    if (data.state === 'fail') throw new Error(data.failMsg ?? 'the read failed');
    if (data.state === 'success') {
      const url = JSON.parse(data.resultJson).resultUrls[0];
      const audio = await fetch(url).then((r) => r.arrayBuffer());
      return Buffer.from(audio);
    }
  }
  throw new Error('gave up waiting');
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const index = [];

  for (const scene of SCENES) {
    const cached = path.join(OUT, `${scene.id}-${fingerprint(scene.say)}.wav`);
    const file = path.join(OUT, `${scene.id}.wav`);

    if (await exists(cached)) {
      await writeFile(file, await readFile(cached));
      console.log(`  · ${scene.id.padEnd(16)} already done`);
    } else {
      process.stdout.write(`  · ${scene.id.padEnd(16)} reading…`);
      const audio = await speak(scene.say);
      await writeFile(cached, audio);
      await writeFile(file, audio);
      console.log(` ${(audio.length / 1024).toFixed(0)} KB`);
    }

    index.push({ id: scene.id, file: `${scene.id}.wav` });
  }

  await writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`\n${SCENES.length} lines of narration → video/build/audio\n`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
