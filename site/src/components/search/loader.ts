// The palette's loader: the only search code on a page until someone asks for search.
// Cmd-K or Ctrl-K, "/" outside a text field, or an `ab:open-search` event (every search
// button) fetches the palette (React, cmdk, Base UI) and the Pagefind index at the same
// time, then opens the palette. Keys typed while it loads go into the search box once it
// opens, so the press that asked for search and everything typed after it count; Escape
// before then cancels the open and gives the keyboard back at once. If the palette's chunk
// fails to load (offline, or a deploy replaced it), the polite live region says so and the
// next request imports it again. Chrome keeps a failed module fetch for the life of the
// page, so there only a reload brings search back, and the message says that.
//
// The key listener sits on window, so it runs after every document-level handler: a "/"
// that the skills catalog took for its own search box arrives here defaultPrevented.
import { OPEN_SEARCH_EVENT, type OpenSearchDetail } from '../search-event';
import { loadIndex } from './pagefind';
import { shortcutAction } from './shortcut.mjs';

type Palette = typeof import('./mount');

let palette: Palette | null = null;
let loading = false;
// the open waiting for the palette: where focus returns and what was typed meanwhile;
// null when nothing waits, including after Escape cancelled it
let request: { returnFocus: HTMLElement | null; typed: string } | null = null;

const inField = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null);

function keepTyping(event: KeyboardEvent) {
  if (event.isComposing || !request) return;
  if (event.key === 'Escape') {
    // cancel now, not when the download finishes, so typing reaches the focused field again
    request = null;
    removeEventListener('keydown', keepTyping, true);
  } else if (event.key === 'Backspace') request.typed = request.typed.slice(0, -1);
  else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) request.typed += event.key;
  else return;
  event.preventDefault();
  event.stopPropagation();
}

async function show(returnFocus: HTMLElement | null, toggle: boolean) {
  if (palette) {
    if (toggle) palette.togglePalette(returnFocus);
    else palette.openPalette(returnFocus);
    return;
  }
  // a request while the palette downloads renews an open that Escape cancelled
  if (!request) {
    request = { returnFocus, typed: '' };
    addEventListener('keydown', keepTyping, true);
  }
  if (loading) return;
  loading = true;
  // the palette waits for the same promise and shows a failure itself
  loadIndex().catch(() => {});
  try {
    palette = await import('./mount');
  } catch {
    const live = document.getElementById('live');
    if (live) live.textContent = 'Search could not load. Reload the page to try again.';
  } finally {
    removeEventListener('keydown', keepTyping, true);
    loading = false;
  }
  const open = request;
  request = null;
  if (palette && open) palette.openPalette(open.returnFocus, open.typed);
}

addEventListener('keydown', (event) => {
  const action = shortcutAction(event, { typing: inField(event.target) });
  if (!action) return;
  event.preventDefault();
  const focused = document.activeElement;
  void show(focused instanceof HTMLElement && focused !== document.body ? focused : null, action === 'toggle');
});

document.addEventListener(OPEN_SEARCH_EVENT, (event) => {
  void show((event as CustomEvent<OpenSearchDetail>).detail?.trigger ?? null, false);
});
