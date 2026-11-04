import type { SetupStatus } from "./chat/types";
import { configuredSecret } from "./gate/code";

// Starter mode only (KTD11, KTD20): the shared password, in its plaintext or digest form, and
// local development. The template's production mode (Neon, Upstash, Sign in with Vercel) is
// pruned from this copy, so storage is always the browser's.

export function isPasswordConfigured() {
  return Boolean(configuredSecret());
}

export function getInitialSetupStatus(): SetupStatus {
  return createSetupStatus();
}

export async function getSetupStatus(): Promise<SetupStatus> {
  return createSetupStatus();
}

export async function isAppConfigured() {
  return createSetupStatus().appReady;
}

function createSetupStatus(): SetupStatus {
  const passwordReady = isPasswordConfigured();
  const localDevReady = isLocalDevelopment();
  const base = {
    authReady: passwordReady || localDevReady,
    connectionsAvailable: false,
    databaseConfigured: false,
    databaseReady: false,
    databaseSchemaReady: false,
    rateLimitReady: true,
    storageMode: "browser" as const,
    demo: process.env.AB_DEMO === "1",
  };

  if (passwordReady || localDevReady) {
    return { ...base, appReady: true, authMode: passwordReady ? "password" : "local-dev", missing: [] };
  }

  return { ...base, appReady: false, authMode: "unconfigured", missing: ["EVE_CHAT_PASSWORD or EVE_CHAT_PASSWORD_DIGEST"] };
}

function isLocalDevelopment() {
  return process.env.NODE_ENV === "development" && process.env.VERCEL !== "1";
}
