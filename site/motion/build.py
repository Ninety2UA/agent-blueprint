"""Assemble each composition into a HyperFrames project under motion/.work/<name>/:
inline shared/ds.css and shared/ds.js into <name>/composition.html, copy the two
font files from src/assets/fonts/ into assets/fonts/, and write the project files."""
import json
import pathlib
import shutil
import sys

MOTION = pathlib.Path(__file__).resolve().parent
SITE = MOTION.parent
FONTS = SITE / "src" / "assets" / "fonts"
WORK = MOTION / ".work"
NAMES = ["film", "readme-hero", "loop-review", "loop-waves", "loop-runner", "loop-handoff"]
HYPERFRAMES = "0.8.140"

css = (MOTION / "shared" / "ds.css").read_text()
js = (MOTION / "shared" / "ds.js").read_text()
for name in sys.argv[1:] or NAMES:
    src = MOTION / name / "composition.html"
    if not src.exists():
        sys.exit(f"no composition for {name}: {src}")
    out_dir = WORK / name
    (out_dir / "assets" / "fonts").mkdir(parents=True, exist_ok=True)
    for f in FONTS.glob("*.woff2"):
        shutil.copy2(f, out_dir / "assets" / "fonts" / f.name)
    html = src.read_text().replace("/*{{DS_CSS}}*/", css).replace("//{{DS_JS}}", js)
    (out_dir / "index.html").write_text(html)
    (out_dir / "hyperframes.json").write_text(json.dumps({
        "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
        "paths": {"blocks": "compositions", "components": "compositions/components", "assets": "assets"},
        "media": {"autoProxy": True},
    }, indent=2) + "\n")
    (out_dir / "meta.json").write_text(json.dumps({"id": name, "name": name}, indent=2) + "\n")
    (out_dir / "package.json").write_text(json.dumps({
        "name": name, "private": True, "type": "module",
        "scripts": {
            "check": f"npx --yes hyperframes@{HYPERFRAMES} check",
            "render": f"npx --yes hyperframes@{HYPERFRAMES} render",
        },
    }, indent=2) + "\n")
    ledger = MOTION / name / "ledger.json"
    if ledger.exists():
        shutil.copy2(ledger, out_dir / "ledger.json")
    print("built", out_dir / "index.html")
