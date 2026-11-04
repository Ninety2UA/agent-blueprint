import { APICallError } from "ai";
import { mockModel } from "eve/evals";
import type { MockModelRequest, MockModelResponse } from "eve/evals";
import { DEMO_REPOSITORY_URL } from "./demo-repository";

// The model for mock-tagged evals: no Gateway call, no tokens. The latest user message
// is a script, one step per line, run one step per model call:
//   skill: <name>               load a skill with eve__skill
//   bash: <command>             run a command in the sandbox
//   read_file: <path>           read a file in the sandbox
//   helper: <role> <script>     brief a root copy through the helper tool, on the role's model;
//                               ";;" separates the copy's own lines
//   clone: <url> [branch]       fetch or clone a repository with clone_repository
//   write_file: <path> <text>   write a file; "\n" in the text is a line break
//   web_fetch: <url>            fetch a URL with web_fetch
//   plan: <request>             load the offered skill the request names, or else the one whose
//                               listed description shares the most words with it, as a model would
//   guess: <name reversed>      load a skill by a name the message does not contain
//   ask: <question> | <a> | <b> ask a checkpoint question with ask_question, two or three options
//   publish: <mode> [stage]     call publish_branch in that mode; the request is the first user message
//   ship: [ceiling] [| answer]  call ship_pipeline once; the request is the first user message
//   brief: <script>             hand the last ship_pipeline brief to the helper with the role it
//                               names; the copy's own lines follow the brief, ";;" separating them
//   spend: <tokens> <command>   run a command and report that many input tokens for the step
//   fail: <status>              the provider refuses the step with that HTTP status, such as 429 or 402
//   remember: <text>            save an operational fact with the ops memory slot
//   recall:                     reply with the memory the session recalled; ends the script
//   tools:                      reply with the names of the tools this call offers, sorted; ends the script
//   say: <text>                 reply with the text, "\n" a line break; ends the script
// When every step has run, the reply is each step's output, one block per step. Under the demo's
// instruction, a message with no steps (a visitor's bare request) clones the repository it names.
// A call offered no tools is a compaction's summary request, answered with a fixed summary.
const STEP = /^(skill|plan|guess|bash|read_file|write_file|web_fetch|helper|clone|ask|publish|ship|brief|spend|fail|remember|recall|tools|say):\s*(.*)$/;

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));
}

// The skills the session offers this call, read from Eve's "Available skills" sections.
function offeredSkills(request: MockModelRequest): Map<string, string> {
  const offered = new Map<string, string>();
  for (const message of request.messages) {
    if (message.role !== "system" && message.role !== "user") continue;
    const lines = message.text.split("\n");
    const start = lines.findIndex((line) => line.trim() === "Available skills");
    if (start < 0) continue;
    for (const line of lines.slice(start + 1)) {
      if (!line.trim()) break;
      const match = /^- (.+?): (.+?)(?: \(path: .+\))?$/.exec(line.trim());
      if (match) offered.set(match[1], match[2]);
    }
  }
  return offered;
}

function planSkill(request: MockModelRequest, wanted: string): string | null {
  const offered = offeredSkills(request);
  const named = [...offered.keys()].find((name) => new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(wanted));
  if (named) return named;
  const asked = words(wanted);
  let best: string | null = null;
  let score = 0;
  for (const [name, description] of offered) {
    const shared = [...words(description)].filter((word) => asked.has(word)).length;
    if (shared > score) [best, score] = [name, shared];
  }
  return best;
}

function toolCall(kind: string, arg: string, request: MockModelRequest): MockModelResponse["toolCalls"] {
  switch (kind) {
    case "skill":
      return [{ name: "eve__skill", input: { name: arg } }];
    case "plan": {
      const name = planSkill(request, arg);
      return name ? [{ name: "eve__skill", input: { name } }] : [];
    }
    case "guess":
      return [{ name: "eve__skill", input: { name: [...arg].reverse().join("") } }];
    case "bash":
      return [{ name: "bash", input: { command: arg } }];
    case "read_file":
      return [{ name: "read_file", input: { filePath: arg } }];
    case "write_file": {
      const [filePath, ...text] = arg.split(" ");
      return [{ name: "write_file", input: { filePath, content: text.join(" ").replaceAll("\\n", "\n") } }];
    }
    case "web_fetch":
      return [{ name: "web_fetch", input: { url: arg } }];
    case "clone": {
      const [repository, branch] = arg.split(/\s+/);
      return [{ name: "clone_repository", input: branch ? { repository, branch } : { repository } }];
    }
    case "ask": {
      const [question, ...options] = arg.split("|").map((part) => part.trim());
      return [{ name: "ask_question", input: { question, options: options.map((label) => ({ label, description: label })) } }];
    }
    case "publish": {
      const [mode, stage] = arg.split(/\s+/);
      const named = request_(request);
      return [{ name: "publish_branch", input: { mode, ...(stage ? { stage } : {}), request: named } }];
    }
    case "ship": {
      const [ceiling, ...answer] = arg.split("|");
      const answered = answer.join("|").trim();
      return [
        {
          name: "ship_pipeline",
          input: { request: request_(request), ...(ceiling.trim() ? { ceiling: Number(ceiling) } : {}), ...(answered ? { answer: answered } : {}) },
        },
      ];
    }
    case "brief": {
      const last = [...request.toolResults].reverse().find((result) => result.name === "ship_pipeline");
      const raw = typeof last?.output === "string" ? JSON.parse(last.output) : last?.output;
      const output = (raw && typeof raw === "object" && "value" in raw ? raw.value : raw) as { role?: string; brief?: string } | undefined;
      if (!output?.role || !output.brief) return [];
      return [{ name: "helper", input: { role: output.role, prompt: `${output.brief}\n${arg.replaceAll(";;", "\n")}` } }];
    }
    case "spend": {
      const [, ...command] = arg.split(" ");
      return [{ name: "bash", input: { command: command.join(" ") || "true" } }];
    }
    case "remember":
      return [{ name: "ops__save_memory", input: { text: arg } }];
    default: {
      const [role, ...rest] = arg.split(" ");
      return [{ name: "helper", input: { role, prompt: rest.join(" ").replaceAll(";;", "\n") } }];
    }
  }
}

// The first user message of the session, which names the run's branch.
function request_(request: MockModelRequest): string {
  return (request.userMessages[0] ?? "mock run").split("\n")[0].slice(0, 200);
}

// The repository the demo's system instruction names, when this call carries it.
function demoRepositoryUrl(request: MockModelRequest): string | null {
  for (const message of request.messages) {
    const match = message.role === "system" ? DEMO_REPOSITORY_URL.exec(message.text) : null;
    if (match) return match[1];
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function respond(request: MockModelRequest): MockModelResponse {
  if (request.tools.length === 0) return { text: "Summary: the scripted mock compacted this conversation." };
  const steps = (request.lastUserMessage ?? "")
    .split("\n")
    .map((line) => STEP.exec(line.trim()))
    .filter((match) => match !== null);
  let script = request.messages.length - 1;
  while (script >= 0) {
    const message = request.messages[script];
    if (message.role === "user" && message.text.includes(request.lastUserMessage ?? "")) break;
    script -= 1;
  }
  const done = request.messages.slice(script + 1).filter((message) => message.role === "tool").length;
  // A message with no steps under the demo's instruction (instructions/demo.ts): clone the
  // repository the instruction names first, as a model following it would.
  const demo = steps.length || done ? null : demoRepositoryUrl(request);
  if (demo) return { toolCalls: [{ name: "clone_repository", input: { repository: demo } }] };
  const next = steps[done];
  if (next?.[1] === "fail") {
    const status = Number(next[2]) || 500;
    throw new APICallError({
      message: `${status} ${status === 429 ? "Too Many Requests" : status === 402 ? "Payment Required" : "Error"} (scripted)`,
      url: "https://ai-gateway.vercel.sh/v1/chat/completions",
      requestBodyValues: {},
      statusCode: status,
      isRetryable: status === 429 || status >= 500,
    });
  }
  if (next?.[1] === "say") return { text: next[2].replaceAll("\\n", "\n") };
  if (next?.[1] === "tools") return { text: request.tools.map((tool) => tool.name).sort().join("\n") };
  if (next?.[1] === "recall") {
    const recalled = request.messages.filter((message) => message.text.includes("# Persistent memories for"));
    return { text: recalled.length ? recalled.map((message) => message.text).join("\n\n") : "Recalled nothing." };
  }
  if (next) {
    const calls = toolCall(next[1], next[2], request);
    if (next[1] === "spend" && calls?.length) return { toolCalls: calls, usage: { inputTokens: Number(next[2].split(" ")[0]) || 0, outputTokens: 1 } };
    if (calls?.length) return { toolCalls: calls };
    return { text: `${next[1]}: no skill on offer matches` };
  }
  if (!done) return { text: "No script steps." };
  return { text: request.toolResults.slice(-done).map((result) => text(result.output)).join("\n\n") };
}

export const scriptedMockModel = () => mockModel({ modelId: "scripted", respond });
