import { defineTool, toolOutput } from "eve/tools";
import { editFile, type EditFileToolOutput } from "eve/tools/edit_file";
import { editAdvisory, editDenial } from "../lib/wrappers/edit_file";

// Eve's edit_file (a default tool from eve 1.0) with write_file's two guards (KTD3, R4), so no tool that
// changes a file skips them. An edit that puts a pattern into a context path still happens, and its
// result carries the warning prompt-guard.js gives in the CLIs. On the demo (AB_DEMO=1) a path under
// .github/ is denied by the approval policy and never edited.
type EditFileResult = EditFileToolOutput & { advisory?: string };

export default defineTool({
  ...editFile,
  outputSchema: undefined,
  approval: ({ toolInput }) => {
    const reason = editDenial(String(toolInput?.path ?? ""));
    return reason ? { type: "denied", reason } : "not-applicable";
  },
  async execute(input, ctx): Promise<EditFileResult> {
    const output = await (editFile.execute(input, ctx) as Promise<EditFileToolOutput>);
    const advisory = editAdvisory(input.path, input.edits);
    return advisory ? { ...output, advisory } : output;
  },
  // Eve's own model output is one line that would drop the warning, so the warning follows it.
  toModelOutput: (output: EditFileResult) => {
    const line = `Successfully replaced ${output.replacements} block(s) in ${output.path}.`;
    return toolOutput.text(output.advisory ? `${line}\n\n${output.advisory}` : line);
  },
});
