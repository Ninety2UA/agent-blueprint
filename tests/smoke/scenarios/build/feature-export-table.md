# Feature: export notes as a text table

Add `notes export --format table`, which renders every note as a text table with the columns
`id`, `title` and `body`, using the `tabulate` package.

## Requirements

- Add `tabulate` to `pyproject.toml` under `[project] dependencies` and install it
  (`python3 -m pip install tabulate`, or `python3 -m pip install -e .`).
- Keep the existing `json` and `md` formats unchanged.
- The table lists every note; a store with two notes prints both titles.
- Cover the new format with a test in `tests/`.
