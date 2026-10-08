import { IC } from './icons';

/** One of the site's icons (icons.ts) inside a React island. The markup is a fixed string from icons.ts. */
export function Icon({ name }: { name: keyof typeof IC }) {
  return <span className="contents" dangerouslySetInnerHTML={{ __html: IC[name] }} />;
}
