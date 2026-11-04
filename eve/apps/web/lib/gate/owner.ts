import { defaultRegistry, type Registry } from "../../../../agent/lib/registry";

// Which visitor a demo session answers (ruling 52). Every cookie holder is the one chat principal
// (agent/channels/eve.ts), so Eve cannot tell visitors apart; the registry can, because the cap
// hook stores the cookie id of the visitor whose turn first reached a session. The eve channel's
// route auth asks here on every /eve/v1/session/:id route (message, answer, stream, descendants,
// subagent streams, cancel, clear, compact, reset): a cookie whose id differs from the stored one
// is refused. A session with no entry yet (its first turn has not started) or with no cookie
// behind it (an OIDC or local caller started it) has no owner to compare. Off the demo there is
// no registry and one password is one principal by design, so nothing is checked there.

export const NOT_OWNER_MESSAGE = "This chat belongs to another visitor, so start a new chat to run your own.";

/** The session id an /eve/v1/session/:id route names, decoded as Eve decodes it; null for any other path. */
export function sessionIdOf(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const at = parts.indexOf("session");
  if (at < 2 || parts[at - 1] !== "v1" || parts[at - 2] !== "eve" || !parts[at + 1]) return null;
  try {
    return decodeURIComponent(parts[at + 1]);
  } catch {
    return parts[at + 1];
  }
}

// A session's owner never changes once stored (the registry only moves its activity, tokens and
// outcome), so an owner found once is kept, which spares the stream's reconnects a registry read.
const OWNERS_KEPT = 1_000;
const owners = new Map<string, string>();
let shared: Registry | undefined;

async function storedOwner(sessionId: string, registry: Registry): Promise<string | null> {
  const known = owners.get(sessionId);
  if (known) return known;
  const entry = (await registry.snapshot()).sessions[sessionId];
  if (!entry) return null;
  if (owners.size >= OWNERS_KEPT) owners.delete(owners.keys().next().value as string);
  owners.set(sessionId, entry.cookieId);
  return entry.cookieId;
}

/** Whether the request names a demo session that a different cookie started. */
export async function ownedByOther(
  request: Request,
  cookieId: string,
  deps: { env?: NodeJS.ProcessEnv; registry?: Registry } = {},
): Promise<boolean> {
  const env = deps.env ?? process.env;
  if (env.AB_DEMO !== "1") return false;
  const sessionId = sessionIdOf(new URL(request.url).pathname);
  if (!sessionId) return false;
  const owner = await storedOwner(sessionId, deps.registry ?? (shared ??= defaultRegistry(env)));
  return owner !== null && owner !== cookieId;
}
