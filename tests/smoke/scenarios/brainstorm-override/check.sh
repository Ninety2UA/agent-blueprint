#!/usr/bin/env bash
# Brainstorm override check: inspect the final message, not raw logs (which can quote the skill's
# instructions). The simple detector flags questions, or direct "please approve"-style requests,
# with approve/confirm/sign off and design/section/approach in the same sentence or line. It also
# catches "does this design look good/right/okay?". An assertion like "the approved design" is fine.
# This is a wording heuristic, not a semantic judge of every possible paraphrase.
# Require a new/changed file under docs/plans/ or src/, or any commit after the seed.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints one reason; exit 0 = pass, 1 = fail.
set -euo pipefail
WORK="$1" BASE="$2" FINAL="$3"
python3 - "$WORK" "$BASE" "$FINAL" <<'PY'
from pathlib import Path
import re
import subprocess
import sys

work, base, final = sys.argv[1:]
text = Path(final).read_text(encoding="utf-8", errors="replace")
for sentence in re.split(r"(?<=[.!?])\s+|\n+", text):
    subject = re.search(r"\b(?:design|section|approach)\b", sentence, re.I)
    approval = re.search(r"\b(?:approve|confirm)\b|\bsign[\s-]+off\b", sentence, re.I)
    direct = re.match(r"\s*(?:[-*]\s*)?(?:please\s+)?(?:approve|confirm|sign[\s-]+off)\b", sentence, re.I)
    looks_good = re.search(r"\blook\s+(?:good|right|ok(?:ay)?)\b", sentence, re.I)
    if subject and ((approval and ("?" in sentence or direct)) or (looks_good and "?" in sentence)):
        print("design approval request in final message: " + sentence.strip())
        sys.exit(1)


def git(*args):
    return subprocess.check_output(["git", "-C", work, *args])


changed = git("diff", "--name-only", "--diff-filter=AM", "-z", base, "--", "docs/plans/", "src/")
untracked = git("ls-files", "--others", "--exclude-standard", "-z", "--", "docs/plans/", "src/")
files = [name for name in (changed + untracked).decode("utf-8", errors="replace").split("\0")
         if name and (Path(work) / name).is_file()]
commits = int(git("rev-list", "--count", f"{base}..HEAD"))
if not files and not commits:
    print("no plan or code under docs/plans/ or src/, and no commit after the seed")
    sys.exit(1)
print("no design approval request; " + ("plan or code: " + ", ".join(files) if files else f"{commits} commit(s) after the seed"))
PY
