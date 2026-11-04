import { NextResponse, type NextRequest } from "next/server";
import { gateRequest } from "@/lib/gate/handlers";
import { isLinearInstallCallback, LINEAR_INSTALL_PATH } from "@/lib/linear-install";

// The gate in front of every page and API route (KTD11, AE5): without a valid session cookie a
// page request gets the 401 gate page and an API request a 401, before any chat code runs. The one
// exception is Linear sending the browser back after an install (GET / with state=install and a
// code, or an error after a cancelled consent; rulings 73 and 74), rewritten to the install route;
// a direct request to that route still meets the gate.
export function proxy(request: NextRequest) {
  if (isLinearInstallCallback(request)) return NextResponse.rewrite(new URL(`${LINEAR_INSTALL_PATH}${request.nextUrl.search}`, request.url));
  return gateRequest(request) ?? NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
