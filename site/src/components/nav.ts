// The site's sections, in header order. `href` is where the nav item goes; `section`
// is the path prefix that marks it current on every page under it. R1 has no index
// page for Docs, Tutorials or Guides, so those items open the first page of the section.
export const NAV = [
  { label: 'Skills', href: '/skills/', section: '/skills/' },
  { label: 'Docs', href: '/docs/getting-started/', section: '/docs/' },
  { label: 'Tutorials', href: '/tutorials/first-feature-new-project/', section: '/tutorials/' },
  { label: 'Workflow', href: '/workflow/', section: '/workflow/' },
  { label: 'Guides', href: '/guides/unattended-runs/', section: '/guides/' },
  { label: 'Kit', href: '/kit/', section: '/kit/' },
  { label: 'Changelog', href: '/changelog/', section: '/changelog/' },
] as const;

export type NavLabel = (typeof NAV)[number]['label'];

export interface NavItem {
  label: string;
  href: string;
  /** "page" on the item's own page, "true" anywhere else in its section */
  current?: 'page' | 'true';
}

export const GET_STARTED = '/docs/getting-started/';

/** The nav items with the current section marked for this path. */
export function navItems(pathname: string): NavItem[] {
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return NAV.map(({ label, href, section }) => ({
    label,
    href,
    current: path === href ? 'page' : path.startsWith(section) ? 'true' : undefined,
  }));
}

/** The section a path belongs to, for the footer's sheet label. */
export function sectionOf(pathname: string): NavLabel | undefined {
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return NAV.find(({ section }) => path.startsWith(section))?.label;
}
