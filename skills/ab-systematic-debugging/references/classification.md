# Error classes

Loaded on demand from SKILL.md § Step 0: Classify the Error when the class of an error is not obvious: the signs, the fast path and the depth of process for each class.

## Classification table

Classify the error before entering the process. Different error types need different depths of investigation, and a missing import does not need four phases.

| Error Class | Examples | Fast Path | Full Process? |
|-------------|----------|-----------|---------------|
| **Syntax/Type** | Missing import, type mismatch, parse error | Search codebase for the export, fix mechanically | No: a deterministic fix, go straight to Phase 4 |
| **Logic** | Test expects A, gets B; wrong output; off-by-one | Focus on failing test + implementation + spec | Yes: Phases 1-4 with medium context |
| **Design** | Wrong architecture, interface mismatch, coupling issues | Needs broad context: spec + architecture + interfaces | Yes: Phases 1-4, and likely the user's decision (SKILL.md Phase 4 step 5) |
| **Performance** | Slow queries, memory leaks, scaling bottlenecks | Needs profiling data + benchmarks | Yes, but consider a specialist, such as the ab-performance-profiling skill |
| **Environment** | Build fails locally but not CI, wrong Node version, missing env var | Check env config + recent dep changes | Phase 1 only: usually config, not code |
| **Flaky test** | Test passes sometimes, fails sometimes, non-deterministic | Run test 3 times to confirm flakiness | No: quarantine it. Mark it flaky, skip it, continue. A flaky test is an infrastructure problem, not a code bug, and fixing it here burns iterations without converging. |

**How to classify:**
- Error in build/compile step → likely **Syntax/Type** or **Environment**
- Error in test with clear expected-vs-actual → likely **Logic**
- Error appears intermittently → likely **Flaky test** (confirm by re-running)
- Error mentions missing module/file/package → likely **Syntax/Type** or **Environment**
- Error only after refactoring, no behavior change intended → likely **Design**

**After classification:**
- **Syntax/Type**: go straight to Phase 4 and fix it mechanically; there is nothing to investigate.
- **Environment**: run Phase 1 only (evidence about the environment), then fix.
- **Flaky test**: quarantine it and move on, without entering the process.
- **All others**: start at Phase 1.
