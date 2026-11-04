// The caller's address, for the login limiter and the per-address session count (KTD11):
//   on Vercel             x-vercel-forwarded-for, which Vercel's edge sets and a caller cannot
//   AB_TRUST_PROXY set    the last hop of x-forwarded-for, the one the proxy in front appended
//   otherwise             the socket address the server saw
// The first hops of x-forwarded-for are whatever the caller sent, so they are never used.
// IPv6 addresses are expanded and cut to their /64, the block one subscriber usually holds.

export function clientAddress(headers: Headers, socket: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  let raw: string | undefined;
  if (env.VERCEL) {
    raw = headers.get("x-vercel-forwarded-for")?.split(",")[0];
  } else if (env.AB_TRUST_PROXY?.trim()) {
    raw = headers.get("x-forwarded-for")?.split(",").at(-1);
  } else {
    raw = socket;
  }
  const trimmed = raw?.trim();
  return trimmed ? canonicalAddress(trimmed) : "unknown";
}

/**
 * IPv4 stays as it is; an IPv4-mapped IPv6 address becomes its IPv4. Other IPv6 addresses are
 * expanded to eight lowercase, zero-padded groups and keyed on the first four, so
 * `2001:db8::1` and `2001:0db8:0:0:ffff::2` share one key.
 */
export function canonicalAddress(raw: string): string {
  const bare = raw.replace(/^\[|\]$/g, "");
  if (!bare.includes(":")) return bare;
  const noZone = bare.split("%")[0];
  const tail = noZone.slice(noZone.lastIndexOf(":") + 1);
  if (tail.includes(".")) return tail;
  const [head, rest] = noZone.split("::");
  const headGroups = head ? head.split(":") : [];
  const restGroups = rest ? rest.split(":") : [];
  const fill = rest === undefined ? 0 : Math.max(0, 8 - headGroups.length - restGroups.length);
  const groups = [...headGroups, ...Array<string>(fill).fill("0"), ...restGroups].map((group) => group.toLowerCase().padStart(4, "0"));
  return `${groups.slice(0, 4).join(":")}::/64`;
}
