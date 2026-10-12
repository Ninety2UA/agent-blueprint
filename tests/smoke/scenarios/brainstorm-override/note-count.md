# Count stored notes

Status: approved

The user approved this design for implementation. Proceed with the implementation.

Add `NoteStore.count()` in `src/notes/store.py`. It returns the number of notes
currently in the store as an integer: zero for an empty store, and two after adding
two notes. It must not modify the notes or write the storage file.

Cover the empty and populated cases with unittest tests. No CLI change is needed.
