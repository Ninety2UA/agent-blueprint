import { headers } from "next/headers";
import type { SetupStatus, Viewer } from "./chat/types";
import { configuredSecret, cookieFromHeaders } from "./gate/code";
import { getSetupStatus } from "./setup";

// Every holder of the shared code is one principal (KTD11), so the viewer is the same for all.
const PASSWORD_VIEWER: Viewer = {
  email: "local@eve.dev",
  id: "eve-chat-user",
  image: null,
  name: "eve user",
};

export async function getServerViewer(setupStatus?: SetupStatus): Promise<Viewer | null> {
  const status = setupStatus ?? (await getSetupStatus());

  if (!status.appReady) {
    return null;
  }

  if (status.authMode === "local-dev") {
    return PASSWORD_VIEWER;
  }

  if (status.authMode === "password") {
    return cookieFromHeaders(await headers(), configuredSecret()) ? PASSWORD_VIEWER : null;
  }

  return null;
}
