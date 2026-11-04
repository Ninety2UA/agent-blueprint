// The Hosted page's configurator (KTD4, after the approved mock's page.js): the markup in
// Configurator.astro holds every route, and this script only shows the one the radios pick. It enables
// the choices the HTML renders disabled, keeps the channel valid (off Vercel the web chat is disabled
// with its reason and the next channel is checked), restores the reader's own channel on a return to
// Vercel, shows the sandbox choice where a host has more than one, swaps in the route's Vercel link, and
// announces each change in the page's polite live region, nothing on load. The first pass reads the
// checked radios. The model choice lives in model-choice.ts, a chunk loaded when the reader first points
// at, focuses or changes the Models row (ruling 22: the on-load script stays as it was); until it
// arrives the default preset's static markup is right for every route. If it cannot load, the row goes
// back to the default preset, so the page never shows a choice its link does not carry.

interface Route {
  id: string;
  host: string;
  channel: string;
  sandbox: string;
  link: string | null;
  /** how many names the route asks for with the default preset */
  n: number;
}

interface Models {
  /** writes the model choice into the shown route: the role rows, the names, the link, the commands */
  show(route: Route): void;
  /** how many role variables the choice adds to the route's names */
  count(): number;
}

const SWAP_MS = 160;
const form = document.getElementById('cfg') as HTMLFormElement | null;

if (form) {
  const routes: Route[] = JSON.parse(form.querySelector('[data-cfg-routes]')?.textContent ?? '[]');
  const radios = [...form.querySelectorAll<HTMLInputElement>('input')];
  const radio = (name: string, value: string) => radios.find((r) => r.name === name && r.value === value)!;
  const checked = (name: string) => radios.find((r) => r.name === name && r.checked)?.value;
  const web = radio('channel', 'web');
  const next = radios.find((r) => r.name === 'channel' && r !== web)!;
  const why = form.querySelector<HTMLElement>('.why')!;
  const sbx = form.querySelector<HTMLElement>('.sbx')!;
  const row = form.querySelector<HTMLElement>('.cfg-models');
  const result = form.querySelector<HTMLElement>('.result')!;
  const results = [...form.querySelectorAll<HTMLElement>('.res')];
  const link = form.querySelector<HTMLAnchorElement>('.res[data-res="vercel"] a');
  const byHost = [...form.querySelectorAll<HTMLElement>('[data-hosts]')];
  const items = [...form.querySelectorAll<HTMLElement>('#cfg-names li')];
  const notes = [...form.querySelectorAll<HTMLElement>('[data-channels]')];
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const say = (text: string) => {
    const live = document.getElementById('live');
    if (live) live.textContent = text;
  };

  let chosen = checked('channel'); // the reader's own channel, restored on a return to Vercel
  let timer = 0;
  let models: Models | undefined;
  let loading: Promise<void> | undefined;

  const show = (route: Route) => {
    result.dataset.host = route.host;
    results.forEach((r) => (r.hidden = r.dataset.res !== route.host));
    byHost.forEach((l) => (l.hidden = !(l.dataset.hosts ?? '').split(' ').includes(route.host)));
    items.forEach((li) => (li.hidden = !(li.dataset.states ?? '').split(' ').includes(route.id)));
    if (link && route.link) link.href = route.link;
    notes.forEach((n) => (n.hidden = !(n.dataset.channels ?? '').split(' ').includes(route.channel)));
    models?.show(route);
  };

  const apply = (event?: Event) => {
    const target = event?.target as HTMLInputElement | undefined;
    if (target?.name === 'channel') chosen = target.value;
    if (target?.closest('.cfg-models') && !models) load();
    const host = checked('host');
    const onHost = routes.filter((r) => r.host === host);
    const webRuns = onHost.some((r) => r.channel === 'web');
    web.disabled = !webRuns;
    web.closest('.opt')?.classList.toggle('is-off', !webRuns);
    why.hidden = webRuns;
    if (webRuns) web.removeAttribute('aria-describedby');
    else web.setAttribute('aria-describedby', why.id);
    if (!webRuns && web.checked) next.checked = true;
    if (webRuns && target?.name === 'host' && chosen === 'web') web.checked = true;
    sbx.hidden = new Set(onHost.map((r) => r.sandbox)).size < 2;

    const channel = checked('channel');
    const matches = onHost.filter((r) => r.channel === channel);
    const route = matches.length > 1 ? matches.find((r) => r.sandbox === checked('sandbox')) : matches[0];
    if (!route) return;

    window.clearTimeout(timer);
    if (!event || reduced()) {
      result.classList.remove('is-swapping');
      show(route);
    } else {
      result.classList.add('is-swapping');
      timer = window.setTimeout(() => {
        show(route);
        result.classList.remove('is-swapping');
      }, SWAP_MS);
    }
    if (!event) return;
    const name = results.find((r) => r.dataset.res === host)?.dataset.name;
    const forced = !webRuns && chosen === 'web';
    say(`${name}, with ${route.n + (models?.count() ?? 0)} variables.${forced ? ` ${why.textContent}.` : ''}`);
  };

  const load = () =>
    (loading ??= import('./model-choice').then(
      (chunk) => {
        models = chunk.default(form);
        apply();
      },
      () => {
        loading = undefined;
        const preset = row?.querySelector<HTMLInputElement>('input[checked]');
        if (preset) preset.checked = true;
      },
    ));

  radios.forEach((r) => (r.disabled = false));
  form.addEventListener('change', apply);
  row?.addEventListener('pointerover', load);
  row?.addEventListener('focusin', load);
  apply();
}
