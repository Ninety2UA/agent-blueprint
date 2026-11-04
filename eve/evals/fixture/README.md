# Eval fixtures

Files the mocked evals copy into the sandbox. `hooks/` belongs to `hooks.eval.ts`:

- `canary-write.md`: the line the CLI hooks smoke writes; its `[SYSTEM]` marker trips the write guard.
- `injection.md`: a line that matches two read-scanner patterns.
- `paraphrase.md`: the same intent as an injection (push from the shell, edit `.github/`) in words no pattern lists.

Each file is one line, because the mock model's steps are one line each.

`smoke-cell.ts` belongs to the live smoke cells (`canary`, `build`, `review`, `ship`). It reads the product's smoke fixture, prompts, seeds and checks in place from `tests/smoke/`, so a cell on Eve is judged by the same `check.sh` as on a CLI. The canary cell adds `paraphrase.md` to the fixture's `STATUS.md`.

With `AB_EVAL_REMOTE=sandbox` (eval-only, ruling 50(b), `agent/lib/eval-remote.ts`), `seedCell` also gives the fixture the origin `https://github.com/ab-eval/smoke-fixture.git` and a bare repository with `main` at `/tmp/ab-eval-remote/ab-eval--smoke-fixture.git` in the sandbox, where `publish_branch` pushes instead of github.com; the build cell then gates on a stage push reaching it. `stand-in.eval.ts` runs the same path on the scripted mock.
