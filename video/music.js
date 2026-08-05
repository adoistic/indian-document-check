#!/usr/bin/env node
/**
 * Fetches the background music from Wikimedia Commons.
 *
 * Freely licensed, but not free of obligation: CC BY asks for the title, the
 * author, the source and the licence wherever the work is used. Those are
 * recorded here, printed on the closing slide, and written into the README —
 * so the credit cannot drift away from the file it belongs to.
 *
 * Cached: the download only happens once.
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'build', 'music');

/**
 * Chosen for being one continuous piece a little longer than the film, so it
 * begins where the film begins and resolves on its own rather than being cut
 * off mid-phrase.
 */
export const TRACK = {
  title: 'Calmant',
  artist: 'Kevin MacLeod',
  artistSite: 'incompetech.com',
  licence: 'CC BY 3.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
  source: 'https://commons.wikimedia.org/wiki/File:Kevin_MacLeod_-_Calmant.ogg',
  url: 'https://upload.wikimedia.org/wikipedia/commons/3/3c/Kevin_MacLeod_-_Calmant.ogg',
  file: 'calmant.ogg',
};

/** One line, carrying everything CC BY asks for. */
export const CREDIT = `Music: “${TRACK.title}” by ${TRACK.artist} (${TRACK.artistSite}), ${TRACK.licence}, via Wikimedia Commons`;

const exists = (file) => access(file).then(() => true, () => false);

export async function ensureMusic() {
  await mkdir(OUT, { recursive: true });
  const file = path.join(OUT, TRACK.file);

  if (await exists(file)) return file;

  // Wikimedia asks for a user agent that says who is calling and why.
  const response = await fetch(TRACK.url, {
    headers: { 'User-Agent': 'DocumentCheckDemo/1.0 (https://github.com/adoistic/indian-document-check)' },
  });
  if (!response.ok) throw new Error(`Could not fetch the music: ${response.status}`);

  await writeFile(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

async function main() {
  const file = await ensureMusic();
  console.log(`  · ${path.relative(process.cwd(), file)}`);
  console.log(`  · ${CREDIT}`);
  console.log(`  · ${TRACK.source}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
