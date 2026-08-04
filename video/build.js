#!/usr/bin/env node
/**
 * Puts the film together.
 *
 * The narration sets the length of every scene. A slide is simply held for as
 * long as its line takes to say, with a slow drift so it does not sit dead on
 * the screen. A recording of the app is stretched or tightened to fit — gently,
 * and where a clip is far too short, it plays at its own pace and then holds on
 * its last frame rather than crawling.
 */
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCENES, GAP_SECONDS, LONG_GAP_AFTER } from './script.js';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(HERE, 'build');
const SEGMENTS = path.join(BUILD, 'segments');

const FPS = 30;
const W = 1920;
const H = 1080;

/** Beyond this, speeding a recording up starts to look silly. */
const MAX_SPEED_UP = 1.9;
/** And beyond this, slowing it down looks like a stutter. */
const MAX_SLOW_DOWN = 1.25;

const ffmpeg = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 28 });

async function duration(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim());
}

const gapAfter = (id) => (LONG_GAP_AFTER.has(id) ? GAP_SECONDS + 0.7 : GAP_SECONDS);

// ── The voice track ───────────────────────────────────────────────────────

/** Each line, then a beat of silence, joined end to end. */
async function buildVoice(scenes) {
  const parts = [];

  for (const scene of scenes) {
    const padded = path.join(SEGMENTS, `voice-${scene.id}.wav`);
    await ffmpeg([
      '-i', scene.audio,
      '-af', `apad=pad_dur=${gapAfter(scene.id)},aresample=48000`,
      '-ac', '2',
      padded,
    ]);
    parts.push(padded);
  }

  const list = path.join(SEGMENTS, 'voice.txt');
  await writeFile(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));

  const voice = path.join(BUILD, 'voice.wav');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', voice]);
  return voice;
}

// ── Pictures ──────────────────────────────────────────────────────────────

/**
 * A still, held for the length of the line, with a very slow push in.
 *
 * The image is fed in as a single frame and zoompan does the multiplying. Loop
 * the input instead and zoompan expands every one of those frames by `d`, which
 * turns a fifteen second slide into several minutes of encoding.
 */
async function slideSegment(scene, seconds, out) {
  const frames = Math.round(seconds * FPS);
  const drift = Math.min(0.05, 0.0004 * frames); // a touch of movement, never a lurch
  const zoom = `zoompan=z='min(1.0009+${(drift / frames).toFixed(8)}*on,${(1 + drift).toFixed(4)})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS}`;

  await ffmpeg([
    '-i', scene.slideFile,
    // A modest upscale first keeps the slow zoom from stepping between pixels.
    '-vf', `scale=${Math.round(W * 1.25)}:${Math.round(H * 1.25)}:flags=lanczos,${zoom},format=yuv420p`,
    '-t', String(seconds),
    '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
    out,
  ]);
}

/**
 * A piece of a recording, fitted to the line. Slight speed changes pass
 * unnoticed; a big shortfall is covered by holding the final frame.
 */
async function clipSegment(scene, seconds, out) {
  const cutLength = scene.end - scene.start;
  let speed = cutLength / seconds; // >1 means play faster
  let hold = 0;

  if (speed > MAX_SPEED_UP) speed = MAX_SPEED_UP;
  if (speed < 1 / MAX_SLOW_DOWN) speed = 1 / MAX_SLOW_DOWN;

  const playedFor = cutLength / speed;
  if (playedFor < seconds) hold = seconds - playedFor;

  const filters = [
    `setpts=${(1 / speed).toFixed(6)}*PTS`,
    `scale=${W}:${H}:flags=lanczos`,
    ...(hold > 0.02 ? [`tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)}`] : []),
    'format=yuv420p',
  ];

  await ffmpeg([
    '-ss', String(scene.start),
    '-t', String(cutLength),
    '-i', scene.clipFile,
    '-vf', filters.join(','),
    '-t', String(seconds),
    '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
    out,
  ]);

  return { speed, hold };
}

// ── Build ─────────────────────────────────────────────────────────────────

async function main() {
  await rm(SEGMENTS, { recursive: true, force: true });
  await mkdir(SEGMENTS, { recursive: true });

  const sessions = JSON.parse(await readFile(path.join(BUILD, 'clips', 'index.json'), 'utf8'));
  const marks = new Map();
  for (const s of sessions) {
    for (const mark of s.marks) marks.set(mark.id, { ...mark, file: path.join(BUILD, 'clips', s.file) });
  }

  // Gather every scene with its line, its length, and its picture.
  const scenes = [];
  for (const scene of SCENES) {
    const audio = path.join(BUILD, 'audio', `${scene.id}.wav`);
    const spoken = await duration(audio);
    const seconds = spoken + gapAfter(scene.id);

    if (scene.kind === 'slide') {
      scenes.push({ ...scene, audio, spoken, seconds, slideFile: path.join(BUILD, 'slides', `${scene.slide}.png`) });
    } else {
      const mark = marks.get(scene.capture);
      if (!mark) throw new Error(`No recording for "${scene.capture}" — run the capture step first.`);
      scenes.push({ ...scene, audio, spoken, seconds, clipFile: mark.file, start: mark.start, end: mark.end });
    }
  }

  console.log('\n  Fitting each scene to its line\n');

  const files = [];
  for (const [i, scene] of scenes.entries()) {
    const out = path.join(SEGMENTS, `${String(i + 1).padStart(2, '0')}-${scene.id}.mp4`);

    if (scene.kind === 'slide') {
      await slideSegment(scene, scene.seconds, out);
      console.log(`  · ${scene.id.padEnd(16)} slide    ${scene.seconds.toFixed(1)}s`);
    } else {
      const { speed, hold } = await clipSegment(scene, scene.seconds, out);
      const note = hold > 0.05 ? `, holds ${hold.toFixed(1)}s` : '';
      console.log(`  · ${scene.id.padEnd(16)} recorded ${scene.seconds.toFixed(1)}s  (${speed.toFixed(2)}×${note})`);
    }

    files.push(out);
  }

  const list = path.join(SEGMENTS, 'reel.txt');
  await writeFile(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));

  const silent = path.join(BUILD, 'reel.mp4');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);

  const voice = await buildVoice(scenes);
  const total = await duration(silent);

  const final = path.join(BUILD, 'document-check.mp4');
  await ffmpeg([
    '-i', silent,
    '-i', voice,
    '-vf', `fade=t=in:st=0:d=0.7,fade=t=out:st=${(total - 1).toFixed(2)}:d=1.0`,
    '-af', `afade=t=in:st=0:d=0.4,afade=t=out:st=${(total - 1).toFixed(2)}:d=1.0`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    '-shortest',
    final,
  ]);

  const length = await duration(final);
  const minutes = Math.floor(length / 60);
  const seconds = Math.round(length % 60);
  console.log(`\n  ${path.relative(process.cwd(), final)}  —  ${minutes}:${String(seconds).padStart(2, '0')}\n`);
}

main().catch((err) => {
  console.error(err.stderr ?? err);
  process.exit(1);
});
