import { useEffect, useRef, useState } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Icon } from '../Icon';

// The catalog filter: the search box and the phase chips (a shadcn toggle group). The skill
// cards stay static HTML outside React. The page's inline script (CatalogScript.astro) holds
// the one matching rule as window.abCatalog: read() turns a query string into a filter state
// and apply() shows or hides the cards and updates the count and the empty state. It also
// shows a filtered URL before the first paint and owns the "/" shortcut, so this island
// hydrates only when someone reaches for it (client:interaction).
//
// The state lives in the URL (?q=...&phase=...): a chip press or a clear adds a history
// entry, typing adds one for its first character and then updates it in place, so Back and
// Forward bring the text and the chip back together. The cards follow every keystroke, but
// the in-place URL update waits until typing pauses for 250 ms (Safari throws once a page
// makes more than 100 history calls in 30 seconds). A chip press or leaving the box writes
// it at once; Back drops it.

export interface CatalogState {
  q: string;
  phase: string;
}

declare global {
  interface Window {
    abCatalog?: {
      read(search: string): CatalogState;
      apply(state: CatalogState): void;
    };
  }
}

interface Props {
  phases: { slug: string; title: string; count: number }[];
  total: number;
}

const ALL = 'all';

function urlFor(state: CatalogState): URL {
  const url = new URL(location.href);
  if (state.q) url.searchParams.set('q', state.q);
  else url.searchParams.delete('q');
  if (state.phase !== ALL) url.searchParams.set('phase', state.phase);
  else url.searchParams.delete('phase');
  return url;
}

export default function SkillFilter({ phases, total }: Props) {
  const [phase, setPhase] = useState(ALL);
  const input = useRef<HTMLInputElement>(null);
  const current = useRef<CatalogState>({ q: '', phase: ALL });
  // true while the current history entry belongs to a run of typing
  const typing = useRef(false);
  // the URL typing has yet to write into that entry, and the timer that writes it
  const pending = useRef<{ url: URL; timer: number } | null>(null);

  const show = (state: CatalogState) => {
    current.current = state;
    setPhase(state.phase);
    window.abCatalog?.apply(state);
  };

  const drop = () => {
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
  };

  const flush = () => {
    const url = pending.current?.url;
    drop();
    if (url && url.href !== location.href) history.replaceState(history.state, '', url);
  };

  const commit = (state: CatalogState, how: 'push' | 'type') => {
    show(state);
    const url = urlFor(state);
    if (how === 'type' && typing.current) {
      drop();
      pending.current = { url, timer: window.setTimeout(flush, 250) };
    } else {
      flush();
      if (url.href !== location.href) history.pushState(history.state, '', url);
    }
    typing.current = how === 'type';
  };

  useEffect(() => {
    const catalog = window.abCatalog;
    const field = input.current;
    if (!catalog || !field) return;
    // adopt what the inline script already showed, plus anything typed before hydration
    const fromUrl = catalog.read(location.search);
    if (field.value !== fromUrl.q) commit({ ...fromUrl, q: field.value }, 'type');
    else show(fromUrl);

    const onPop = () => {
      // the entry that typing was updating is no longer the current one
      drop();
      typing.current = false;
      const state = catalog.read(location.search);
      field.value = state.q;
      show(state);
    };
    // the empty state's clear link reloads /skills/ before hydration; here it clears in place
    const onClear = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest('[data-catalog-clear]')) return;
      event.preventDefault();
      field.value = '';
      commit({ q: '', phase: ALL }, 'push');
      field.focus();
    };
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClear);
    return () => {
      drop();
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClear);
    };
  }, []);

  return (
    <div className="sf">
      <label className="sf-label" htmlFor="skill-q">Find a skill</label>
      <div className="sf-field">
        <Icon name="search" />
        <input
          ref={input}
          id="skill-q"
          type="search"
          defaultValue=""
          placeholder="Try review, plan or debug"
          autoComplete="off"
          spellCheck={false}
          aria-keyshortcuts="/"
          aria-controls="skill-cards"
          onInput={(event) => commit({ ...current.current, q: event.currentTarget.value }, 'type')}
          onBlur={flush}
        />
        <kbd aria-hidden="true">/</kbd>
      </div>
      <ToggleGroup
        className="chips sf-chips"
        aria-label="Filter by phase"
        value={[phase]}
        onValueChange={(value) => {
          // pressing the selected chip again releases it, which means all phases
          const next = value[0] ?? ALL;
          if (next !== current.current.phase) commit({ ...current.current, phase: next }, 'push');
        }}
      >
        <ToggleGroupItem value={ALL} data-phase-chip={ALL} data-title="All">
          All<span className="n" data-claim="skills">{total}</span>
        </ToggleGroupItem>
        {phases.map((p) => (
          <ToggleGroupItem key={p.slug} value={p.slug} data-phase-chip={p.slug} data-title={p.title}>
            {p.title}
            <span className="n">{p.count}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
