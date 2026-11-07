import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { ROLES, resolveRole, rosterModelError, type Role, type RoleSelection } from "../lib/roster";

const STOPPED_REPLY_CHARS = 4_000;

// The role's model and reasoning come from the roster (KTD8), read when the helper is briefed.
async function resolveHelperRole(role: Role): Promise<RoleSelection> {
  "use step";
  return resolveRole(role);
}

export default defineWorkflowTool({
  description: [
    "Brief a fresh copy of yourself on one focused task, on the model the roster assigns to the role.",
    "The copy shares your sandbox, tools and skills but not this conversation,",
    "so the prompt must carry everything it needs: the goal, the files, what to return and whether it may change files.",
  ].join(" "),
  inputSchema: z.object({
    prompt: z.string().min(1).describe("The complete brief for the helper."),
    role: z.enum(ROLES).describe("The roster role the helper works in, such as reviewer."),
  }),
  availableInSubagents: false,
  async execute({ prompt, role }, ctx) {
    "use workflow";
    const selection = await resolveHelperRole(role);
    const { role: _role, ...model } = selection;
    const named = { role, model: selection.model, reasoning: selection.reasoning };
    try {
      // Under AB_EVAL_MOCK=1 the copy runs on the root's scripted mock, so a mocked eval never
      // reaches the Gateway; the result still names the role's model.
      const helper = ctx.agent("agent", process.env.AB_EVAL_MOCK === "1" ? {} : { model });
      const response = await helper.send(prompt, { signal: ctx.abortSignal });
      const result = await response.result();
      return {
        ...named,
        status: result.status,
        // A person's steering message aborts this signal, and the helper then reports cancelled too.
        interrupted: ctx.abortSignal.aborted,
        // The session's view withholds a long output, and the stop rules read this one from it.
        reply: result.status === "completed" ? (result.reply ?? null) : (result.reply?.slice(0, STOPPED_REPLY_CHARS) ?? null),
        error: result.error ? rosterModelError(selection, result.error.message).message : null,
      };
    } catch (error) {
      // Eve refuses a model its Gateway catalog does not list by throwing here, before any call (R6).
      if (ctx.abortSignal.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      return { ...named, status: "failed" as const, interrupted: false, reply: null, error: rosterModelError(selection, message).message };
    }
  },
});
