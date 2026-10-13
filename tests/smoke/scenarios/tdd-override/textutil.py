"""Small text helpers for notes."""


def normalize_title(text):
    return " ".join(text.split())


def first_line(text):
    lines = text.splitlines()
    return lines[0] if lines else ""


def note_key(number):
    return "note-%04d" % number
