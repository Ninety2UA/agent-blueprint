// The palette's loader: the only search code on a page until someone asks for search.
// Cmd-K or Ctrl-K, "/" outside a text field, or an `ab:open-search` event (every search
// button) fetches the palette (React, cmdk, Base UI) and the Pagefind index at the same
// time, then opens the palette. Keys typed while it loads go into the search box once it
// opens, so the press that asked for search and everything typed after it count; Escape
// before then cancels the open.
//
// The key listener sits on window, so it runs after every document-level handler: a "/"
// that the skills catalog took for its own search box arrives here defaultPrevented.
import { OPEN_SEARCH_EVENT, type OpenSearchDetail } from '../search-event';
import { loadIndex } from './pagefind';
import { shortcutAction } from './shortcut.mjs';

type Palette = typeof import('./mount');

let palette: Palette | null = null;
let loading = false;
let typed = '';
let cancelled = false;

const inField = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null);

function keepTyping(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === 'Escape') cancelled = true;
  else if (event.key === 'Backspace') typed = typed.slice(0, -1);
  else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) typed += event.key;
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
  if (loading) return;
  loading = true;
  typed = '';
  cancelled = false;
  addEventListener('keydown', keepTyping, true);
  // the palette waits for the same promise and shows a failure itself
  loadIndex().catch(() => {});
  try {
    palette = await import('./mount');
  } finally {
    removeEventListener('keydown', keepTyping, true);
    loading = false;
  }
  if (!cancelled) palette.openPalette(returnFocus, typed);
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
