"""Command line for the notes store: add, list, search, export."""

import argparse
import sys

from .store import NoteStore

EXPORT_FORMATS = ("json", "md", "table")


def build_parser():
    parser = argparse.ArgumentParser(prog="notes", description="A small notes store.")
    parser.add_argument("--store", default="notes.json", help="path of the JSON store (default: notes.json)")
    commands = parser.add_subparsers(dest="command")
    commands.required = True

    add = commands.add_parser("add", help="add a note")
    add.add_argument("title")
    add.add_argument("body")

    commands.add_parser("list", help="list every note")

    search = commands.add_parser("search", help="find notes by a word in the title or body")
    search.add_argument("query")

    export = commands.add_parser("export", help="print every note in a format")
    export.add_argument("--format", choices=EXPORT_FORMATS, default="json")
    return parser


def format_line(note):
    return "%d\t%s\t%s" % (note.id, note.title, note.body)


def main(argv=None):
    args = build_parser().parse_args(argv)
    store = NoteStore(args.store)
    if args.command == "add":
        note = store.add(args.title, args.body)
        print("added %d: %s" % (note.id, note.title))
    elif args.command == "list":
        for note in store.list():
            print(format_line(note))
    elif args.command == "search":
        for note in store.search(args.query):
            print(format_line(note))
    elif args.command == "export":
        if args.format == "table":
            from tabulate import tabulate

            rows = [(note.id, note.title, note.body) for note in store.list()]
            print(tabulate(rows, headers=("id", "title", "body")))
        else:
            print(store.export(args.format))
    return 0


if __name__ == "__main__":
    sys.exit(main())
