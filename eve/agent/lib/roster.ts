// The model roster (KTD8): each role's AI Gateway id and reasoning level, per preset.
// AB_ROSTER picks the preset; AB_MODEL_<ROLE> and AB_REASONING_<ROLE> override one role.
// An unset or empty variable keeps the preset's value. Nothing here checks the Gateway's
// catalog: a model the Gateway does not serve fails the turn, and nothing is substituted.

export const ROLES = ["lead", "planner", "builder", "reviewer", "tester", "analyst", "documenter"] as const;
export type Role = (typeof ROLES)[number];

export const REASONING = ["provider-default", "none", "minimal", "low", "medium", "high", "xhigh"] as const;
export type Reasoning = (typeof REASONING)[number];

type ModelOptions = { providerOptions: { gateway: { caching: "auto" } } };

export interface RoleSelection {
  readonly role: Role;
  readonly model: string;
  readonly reasoning: Reasoning;
  /** Set for Anthropic ids: the Gateway's automatic prompt caching. */
  readonly modelOptions?: ModelOptions;
}

interface Preset {
  readonly roles: Record<Role, { readonly model: string; readonly reasoning: Reasoning }>;
  /** New input tokens (input less cache reads) a session may spend before it asks to continue. */
  readonly sessionInputTokens: number;
}

// Both presets ship (ruling 29): `quality` is the default, `budget` runs every role on cheaper models.
export const PRESETS = {
  quality: {
    roles: {
      lead: { model: "anthropic/claude-opus-5.5", reasoning: "high" },
      planner: { model: "anthropic/claude-opus-5.5", reasoning: "high" },
      builder: { model: "anthropic/claude-opus-5.5", reasoning: "high" },
      reviewer: { model: "openai/gpt-6-astra", reasoning: "high" },
      tester: { model: "anthropic/claude-sonnet-5.5", reasoning: "high" },
      analyst: { model: "anthropic/claude-sonnet-5.5", reasoning: "medium" },
      documenter: { model: "anthropic/claude-haiku-5.5", reasoning: "medium" },
    },
    // Eve's own default limit, kept until the smoke record measures a run.
    sessionInputTokens: 40_000_000,
  },
  budget: {
    roles: {
      lead: { model: "zai/glm-5.3", reasoning: "high" },
      planner: { model: "zai/glm-5.3", reasoning: "high" },
      builder: { model: "zai/glm-5.3", reasoning: "high" },
      reviewer: { model: "deepseek/deepseek-v4.1-flash-1017", reasoning: "xhigh" },
      tester: { model: "deepseek/deepseek-v4.1-flash-1017", reasoning: "high" },
      analyst: { model: "deepseek/deepseek-v4.1-flash-1017", reasoning: "high" },
      documenter: { model: "deepseek/deepseek-v4.1-flash-1017", reasoning: "high" },
    },
    // The same limit as quality, kept until the smoke record measures a run.
    sessionInputTokens: 40_000_000,
  },
} as const satisfies Record<string, Preset>;
export type PresetName = keyof typeof PRESETS;

export const DEFAULT_PRESET: PresetName = "quality";
const CACHING: ModelOptions = { providerOptions: { gateway: { caching: "auto" } } };
const GATEWAY_ID = /^[a-z0-9-]+\/[A-Za-z0-9._:-]+$/;

type Env = Readonly<Record<string, string | undefined>>;

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function presetName(env: Env = process.env): PresetName {
  const name = read(env, "AB_ROSTER") ?? DEFAULT_PRESET;
  if (!Object.hasOwn(PRESETS, name)) {
    throw new Error(`AB_ROSTER is "${name}"; the presets are ${Object.keys(PRESETS).join(", ")}.`);
  }
  return name as PresetName;
}

export function preset(env: Env = process.env): Preset {
  return PRESETS[presetName(env)];
}

/** One role's model and reasoning: the preset's, then the role's overrides. */
export function resolveRole(role: Role, env: Env = process.env): RoleSelection {
  const key = role.toUpperCase();
  const base = preset(env).roles[role];
  const model = read(env, `AB_MODEL_${key}`) ?? base.model;
  if (!GATEWAY_ID.test(model)) {
    throw new Error(`Roster role "${role}" has model "${model}", which is not an AI Gateway id such as "${base.model}" (AB_MODEL_${key}).`);
  }
  const reasoning = read(env, `AB_REASONING_${key}`) ?? base.reasoning;
  if (!(REASONING as readonly string[]).includes(reasoning)) {
    throw new Error(`Roster role "${role}" has reasoning "${reasoning}"; the levels are ${REASONING.join(", ")} (AB_REASONING_${key}).`);
  }
  return {
    role,
    model,
    reasoning: reasoning as Reasoning,
    ...(model.startsWith("anthropic/") ? { modelOptions: CACHING } : {}),
  };
}

export function resolveRoster(env: Env = process.env): Record<Role, RoleSelection> {
  return Object.fromEntries(ROLES.map((role) => [role, resolveRole(role, env)])) as Record<Role, RoleSelection>;
}

/** The failure of a turn on a roster model, naming the role and the id; the caller substitutes nothing. */
export function rosterModelError(selection: RoleSelection, cause: unknown): Error {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return new Error(
    `Roster role "${selection.role}" runs on "${selection.model}", and the turn failed: ${reason}. ` +
      `No other model was tried; set AB_MODEL_${selection.role.toUpperCase()} to a model the AI Gateway serves.`,
    { cause },
  );
}
