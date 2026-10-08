// The facts the Kit page lists for each file, read from the file itself at build time (ported from
// file_row() in the approved f/src/media.py, without ffprobe): its size on disk, its format, the frame
// size of a JPG or GIF from its own header, the length of a GIF from its frame delays, and the grid of
// an SVG from its viewBox. An MP4's frame and length come from mp4Facts() in ../media.ts, which
// FileTable.astro adds; this module stays plain Node so the tests can read the same files.
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const FORMATS = { '.mp4': 'MP4 (H.264)', '.jpg': 'JPG', '.gif': 'GIF', '.json': 'JSON', '.svg': 'SVG' };

/** 295 -> "295 B", 54190 -> "53 KB", 4501840 -> "4.29 MB" */
export function humanSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

// The logical screen size, then every block up to the trailer: each graphic control extension
// carries the delay before the next frame, in hundredths of a second.
function gifFacts(buf) {
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  const table = (flags) => (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0);
  const skipSubBlocks = (pos) => {
    while (buf[pos] !== 0) pos += buf[pos] + 1;
    return pos + 1;
  };
  let hundredths = 0;
  let pos = 13 + table(buf[10]);
  while (pos < buf.length && buf[pos] !== 0x3b) {
    if (buf[pos] === 0x21) {
      if (buf[pos + 1] === 0xf9) hundredths += buf.readUInt16LE(pos + 4);
      pos = skipSubBlocks(pos + 2);
    } else if (buf[pos] === 0x2c) {
      pos = skipSubBlocks(pos + 10 + table(buf[pos + 9]) + 1);
    } else {
      throw new Error(`GIF: unknown block 0x${buf[pos].toString(16)} at byte ${pos}`);
    }
  }
  return { width, height, duration: hundredths / 100 };
}

// The first start-of-frame marker holds the height and width.
function jpegFacts(buf) {
  for (let pos = 2; pos + 9 < buf.length; ) {
    const marker = buf[pos + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buf.readUInt16BE(pos + 7), height: buf.readUInt16BE(pos + 5) };
    }
    pos += 2 + buf.readUInt16BE(pos + 2);
  }
  throw new Error('JPG: no start-of-frame marker');
}

/**
 * { bytes, size, format, frame, length } for the file at `path`. frame is "1280 × 512" for a JPG or
 * GIF and "28 grid" for an SVG; length is "10.0 s" for a GIF; both are "" where they do not apply.
 */
export function fileFacts(path) {
  const ext = extname(path).toLowerCase();
  const bytes = statSync(path).size;
  let frame = '';
  let length = '';
  if (ext === '.gif') {
    const g = gifFacts(readFileSync(path));
    frame = `${g.width} × ${g.height}`;
    length = `${g.duration.toFixed(1)} s`;
  } else if (ext === '.jpg') {
    const j = jpegFacts(readFileSync(path));
    frame = `${j.width} × ${j.height}`;
  } else if (ext === '.svg') {
    const box = readFileSync(path, 'utf8').match(/viewBox="0 0 (\d+) \d+"/);
    frame = box ? `${box[1]} grid` : '';
  }
  return { bytes, size: humanSize(bytes), format: FORMATS[ext] ?? ext.slice(1).toUpperCase(), frame, length };
}
