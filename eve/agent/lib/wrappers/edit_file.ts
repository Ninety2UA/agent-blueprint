import { demoWriteDenial, writeAdvisory } from "./write_file";

// The write_file guards, for the edit_file tool eve adds to every agent from 1.0 (KTD3, R4). edit_file
// changes a file in place, so it would otherwise write past both: the demo's refusal under .github/ and
// the injection warning on context paths. The warning scans the text each edit puts in, as
// prompt-guard.js scans an Edit's new_string in the CLIs.

// eve's resolveEditPath (eve/dist/src/tools/provided/edit-file.js) reads these as plain spaces.
const UNICODE_SPACES = /[  -   　]/g;

/**
 * The path edit_file writes, read the way eve reads it before resolving: special spaces as spaces,
 * a leading @ dropped and a file:// URL as its decoded path. "@.github/x" or "file:///w/%2Egithub/x"
 * would otherwise reach .github/ with a first segment the check does not see.
 */
export function editTargetPath(path: string): string {
  let target = path.replace(UNICODE_SPACES, " ");
  if (target.startsWith("@")) target = target.slice(1);
  if (target.startsWith("file://")) {
    try {
      target = decodeURIComponent(new URL(target).pathname);
    } catch {
      // eve fails the same call on a URL it cannot read, so nothing is written; the raw path is checked.
    }
  }
  return target;
}

/** The demo's refusal for an edit under .github/, or null when the edit may go ahead. */
export function editDenial(path: string, demo?: boolean): string | null {
  return demoWriteDenial(editTargetPath(path), demo);
}

/** The prompt-guard warning for the text the edits write into a context path, or null when nothing matched. */
export function editAdvisory(path: string, edits: ReadonlyArray<{ readonly newText: string }>): string | null {
  return writeAdvisory(editTargetPath(path), edits.map((edit) => edit.newText).join("\n"));
}
