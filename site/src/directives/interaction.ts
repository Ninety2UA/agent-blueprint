import type { ClientDirective } from 'astro';

// client:interaction hydrates an island the first time someone reaches for it, so a
// page ships no framework JavaScript until then. Pointing at it or focusing it starts
// the download early; a click or key press that arrives before hydration is finished
// is replayed on the same element afterwards, so the first press is never lost.
const START = ['pointerover', 'pointerdown', 'focusin', 'keydown', 'click'] as const;

const interaction: ClientDirective = (load, _options, el) => {
  let hydrating: Promise<void> | null = null;
  let replay: HTMLElement | null = null;

  const stop = () => START.forEach((type) => el.removeEventListener(type, onEvent, true));

  const hydrate = () =>
    (hydrating ??= (async () => {
      const run = await load();
      await run();
      stop();
      // the island's markup is hydrated in place, so the pressed element is still the same node
      const target = replay;
      replay = null;
      if (target?.isConnected) target.click();
    })());

  function onEvent(event: Event) {
    if (event.type === 'click') {
      const target = (event.target as Element | null)?.closest<HTMLElement>('button, a, [role="button"]');
      if (target) {
        // keep the press for the hydrated component instead of letting it fall through now
        event.preventDefault();
        event.stopPropagation();
        replay = target;
      }
    }
    void hydrate();
  }

  START.forEach((type) => el.addEventListener(type, onEvent, true));
};

export default interaction;
