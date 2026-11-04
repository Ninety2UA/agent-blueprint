import { defineSandbox, type SandboxSession } from "eve/sandbox";
import { DockerSandbox } from "eve/sandbox/docker";
import { VercelSandbox } from "eve/sandbox/vercel";
import { basePolicy, parseAllowedHosts } from "../lib/credentials";
import { VARIABLES } from "../lib/env";
import { DaytonaSandbox } from "./providers/daytona";

// The sandbox provider (KTD7), chosen by AB_SANDBOX: vercel on Vercel, docker elsewhere,
// daytona where no Docker daemon exists. eve build prepares the chosen environment and
// records it, so the server it produces keeps that provider. The repository is cloned by
// tools/clone_repository.ts, because this selector sees the session but never the
// message that names the repository.
const PROVIDERS = ["vercel", "docker", "daytona"] as const;
export type Provider = (typeof PROVIDERS)[number];

function selectProvider(): Provider {
  const value = process.env.AB_SANDBOX?.trim() || (process.env.VERCEL ? "vercel" : "docker");
  if (!(PROVIDERS as readonly string[]).includes(value)) {
    throw new Error(`AB_SANDBOX is "${value}"; the providers are ${PROVIDERS.join(", ")}.`);
  }
  return value as Provider;
}

/** The hosts besides GitHub the sandbox may reach, from AB_ALLOWED_HOSTS or its default in the variable table. */
export function allowedHosts(): string[] {
  const fallback = VARIABLES.find((variable) => variable.name === "AB_ALLOWED_HOSTS")?.default ?? "";
  return parseAllowedHosts(process.env.AB_ALLOWED_HOSTS, fallback);
}

// The longest Vercel Sandbox session the Hobby plan allows. A session stopped at the
// limit resumes with its files at the next step.
const VERCEL_SESSION_MS = 45 * 60 * 1_000;
const MIN_EXTENSION_MS = 60 * 1_000;

// eve's base image has git and python3 but not gh. Vercel and Daytona install them here,
// at build; Docker gets gh from the Dockerfile beside this file.
async function installTools(sandbox: SandboxSession): Promise<void> {
  const result = await sandbox.run({
    command: "sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git gh python3",
  });
  if (result.exitCode !== 0) throw new Error(`installing git, gh and python3 failed: ${result.stderr}`);
}

export const provider = selectProvider();

// Only the chosen environment is constructed, so a build never prepares another provider.
const vercel = provider === "vercel" ? VercelSandbox.environment({ prepare: installTools }) : null;
const daytona = provider === "daytona" ? DaytonaSandbox.environment({ prepare: installTools }) : null;
const docker = provider === "docker" ? DockerSandbox.dockerfile() : null;

export const environment = vercel ?? daytona ?? docker!;

// The network policy is read when a session's sandbox is created: the GitHub pair plus
// the allowed hosts on Vercel and Daytona, allow-all or deny-all on Docker.
export default defineSandbox(() => {
  const networkPolicy = basePolicy(provider, allowedHosts());
  if (vercel) return vercel.open({ timeout: VERCEL_SESSION_MS, networkPolicy });
  if (daytona) return daytona.open({ networkPolicy });
  return docker!.open({ networkPolicy: networkPolicy as "allow-all" | "deny-all" });
});

/**
 * Gives a live Vercel Sandbox a full session's time again, called from the steps that use
 * it. eve's session has no way to extend its timeout, so this reaches the sandbox by name
 * through @vercel/sandbox. Vercel caps the total at the plan's maximum (45 minutes on
 * Hobby); an extension past it is refused and the sandbox stops at the cap, then resumes
 * with its files at the next step, so a refusal is logged and the step goes on. A sandbox
 * opened moments ago is a few hundred milliseconds short of the full time, and Vercel
 * refuses an extension under one second (seen live: "`duration` should be >= 1000"), so
 * a gap under a minute is left alone.
 */
export async function extendSandboxTimeout(sandbox: SandboxSession): Promise<void> {
  const name = provider === "vercel" ? (sandbox as { name?: string }).name : undefined;
  if (!name) return;
  try {
    const { Sandbox } = await import("@vercel/sandbox");
    const live = await Sandbox.get({ name });
    const left = (live.expiresAt?.getTime() ?? 0) - Date.now();
    if (live.status !== "running" || VERCEL_SESSION_MS - left < MIN_EXTENSION_MS) return;
    await live.extendTimeout(VERCEL_SESSION_MS - left);
  } catch (error) {
    console.warn(`extending the timeout of sandbox ${name} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
