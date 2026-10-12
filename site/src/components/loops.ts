// A loop from the Kit's LOOPS by name, for a page that embeds it with VideoFigure: its file, caption
// (HTML), control label and text alternative, written once in kit/kit-data.ts. A page that names a
// loop LOOPS does not have stops the build.
import { LOOPS } from './kit/kit-data';

export function loop(name: string) {
  const found = LOOPS.find((l) => l.name === name);
  if (!found) throw new Error(`A page embeds the loop ${name}, which LOOPS in site/src/components/kit/kit-data.ts does not list`);
  return { ...found, src: `/media/${name}.mp4` };
}
