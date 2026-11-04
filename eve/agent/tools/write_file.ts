import { defineTool } from "eve/tools";
import { writeFile, type WriteFileToolOutput } from "eve/tools/write_file";
import { demoWriteDenial, writeAdvisory } from "../lib/wrappers/write_file";

// Eve's write_file with the write-time injection guard (KTD3, R4). A write to a context
// path whose content matches a pattern still happens, and its result carries the warning
// prompt-guard.js gives in the CLIs. On the demo (AB_DEMO=1) a path under .github/ is
// denied by the approval policy and never written.
export default defineTool({
  ...writeFile,
  outputSchema: undefined,
  approval: ({ toolInput }) => {
    const reason = demoWriteDenial(String(toolInput?.filePath ?? ""));
    return reason ? { type: "denied", reason } : "not-applicable";
  },
  async execute(input, ctx): Promise<WriteFileToolOutput & { advisory?: string }> {
    const output = await (writeFile.execute(input, ctx) as Promise<WriteFileToolOutput>);
    const advisory = writeAdvisory(input.filePath, input.content);
    return advisory ? { ...output, advisory } : output;
  },
});
