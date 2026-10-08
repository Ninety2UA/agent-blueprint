import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';

export interface VideoFacts {
  /** seconds */
  duration: number;
  width: number;
  height: number;
}

const facts = new Map<string, VideoFacts>();

// Reads an MP4's length and frame size at build time from its own boxes (mvhd and the
// first video tkhd), so a re-render changes the page with no edit under site/. Paths are
// relative to site/public, where the media live. Each file is read once per build.
export function mp4Facts(publicPath: string): VideoFacts {
  let f = facts.get(publicPath);
  if (!f) facts.set(publicPath, (f = readMp4Facts(publicPath)));
  return f;
}

function readMp4Facts(publicPath: string): VideoFacts {
  const fd = openSync(join(process.cwd(), 'public', publicPath), 'r');
  try {
    const read = (pos: number, len: number) => {
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, pos);
      return buf;
    };
    // walk the boxes between start and end, returning each box's payload range
    const boxes = (start: number, end: number) => {
      const out: { type: string; at: number; end: number }[] = [];
      for (let pos = start; pos + 8 <= end; ) {
        const head = read(pos, 16);
        let size = head.readUInt32BE(0);
        let header = 8;
        if (size === 1) {
          size = Number(head.readBigUInt64BE(8));
          header = 16;
        } else if (size === 0) {
          size = end - pos;
        }
        out.push({ type: head.toString('latin1', 4, 8), at: pos + header, end: pos + size });
        pos += size;
      }
      return out;
    };
    const find = (list: ReturnType<typeof boxes>, type: string) => {
      const box = list.find((b) => b.type === type);
      if (!box) throw new Error(`${publicPath}: no ${type} box`);
      return box;
    };

    const moov = find(boxes(0, fstatSync(fd).size), 'moov');
    const inMoov = boxes(moov.at, moov.end);

    const mvhd = find(inMoov, 'mvhd');
    const m = read(mvhd.at, 32);
    const duration =
      m[0] === 1
        ? Number(m.readBigUInt64BE(24)) / m.readUInt32BE(20)
        : m.readUInt32BE(16) / m.readUInt32BE(12);

    // tkhd ends with the track's width and height as 16.16 fixed point
    for (const trak of inMoov.filter((b) => b.type === 'trak')) {
      const tkhd = find(boxes(trak.at, trak.end), 'tkhd');
      const wh = read(tkhd.end - 8, 8);
      const width = wh.readUInt32BE(0) >>> 16;
      const height = wh.readUInt32BE(4) >>> 16;
      if (width && height) return { duration, width, height };
    }
    throw new Error(`${publicPath}: no video track`);
  } finally {
    closeSync(fd);
  }
}

/** 59.5 -> "0:59" */
export function clock(seconds: number): string {
  const t = Math.max(0, seconds);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}
