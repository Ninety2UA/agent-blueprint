# Conventions

## Stack

- Python 3.9 or newer, standard library only unless a feature requires a package.
- The package lives in `src/notes/`; tests in `tests/`.
- Dependencies are declared in `pyproject.toml` under `[project] dependencies`.

## Commands

| Task | Command |
|------|---------|
| Test | `python3 -m unittest discover -s tests` |
| Run the CLI | `PYTHONPATH=src python3 -m notes --help` |
| Install for development | `python3 -m pip install -e .` |

## Patterns

- One test file per module: `tests/test_<module>.py`.
- The CLI (`cli.py`) parses arguments and prints; the store (`store.py`) holds the data logic.
- Commits: `type(scope): description`.
