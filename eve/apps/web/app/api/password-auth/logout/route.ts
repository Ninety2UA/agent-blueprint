import { handleLogout } from "@/lib/gate/handlers";

export function POST(request: Request) {
  return handleLogout(request);
}
