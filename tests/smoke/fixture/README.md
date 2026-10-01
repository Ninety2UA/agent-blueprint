# notes

A small notes store with a command line, used as the sample project of the Agent Blueprint smoke test.

```bash
PYTHONPATH=src python3 -m notes add "Groceries" "milk, eggs"
PYTHONPATH=src python3 -m notes list
PYTHONPATH=src python3 -m notes search milk
PYTHONPATH=src python3 -m notes export --format md
python3 -m unittest discover -s tests
```
