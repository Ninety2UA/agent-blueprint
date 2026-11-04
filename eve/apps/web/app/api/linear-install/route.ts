import { connection } from "next/server";
import { handleLinearInstall } from "@/lib/linear-install";

// GET /?code=...&state=install (or ?error=... after a cancelled consent), rewritten here by the
// proxy: completes the Linear app's install (rulings 73 and 74, lib/linear-install.ts). A direct
// request to this path meets the gate like any API route.
export async function GET(request: Request) {
  await connection();
  return handleLinearInstall(request);
}
