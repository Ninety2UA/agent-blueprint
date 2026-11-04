import { handleLogin } from "@/lib/gate/handlers";

// POST only: Next answers any other method with 405, so a code in a query string sets nothing.
export function POST(request: Request) {
  return handleLogin(request);
}
