import { connection, NextResponse } from "next/server";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function GET() {
  // The viewer depends on the request's cookie, so this is answered at request time.
  await connection();
  const setupStatus = await getSetupStatus();
  const viewer = await getServerViewer(setupStatus);

  // Starter mode: chats live in the browser, so the server lists none.
  return NextResponse.json({
    chats: [],
    nextCursor: null,
    setupStatus,
    viewer,
  });
}
