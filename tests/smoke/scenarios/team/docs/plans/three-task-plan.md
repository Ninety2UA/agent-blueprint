# Three-task fixture plan

Goal: add three small functions with tests.

## Tasks

### T1: add()
- Files: calc.py, test_calc.py
- Depends on: none
- Add `add(a, b)` to `calc.py`, returning the sum of two numbers.
- Test in `test_calc.py`: `add(2, 3) == 5` and `add(-1, 1) == 0`.
- Check: `python3 -m unittest -v` passes.

### T2: greet()
- Files: greet.py, test_greet.py
- Depends on: none
- Create `greet.py` with `greet(name)` returning `"Hello, <name>!"`.
- Test in `test_greet.py`: `greet("Ada") == "Hello, Ada!"`.
- Check: `python3 -m unittest -v` passes.

### T3: sub()
- Files: calc.py, test_calc.py
- Depends on: none
- Add `sub(a, b)` to `calc.py`, returning `a - b`.
- Test in `test_calc.py`: `sub(5, 3) == 2`.
- Check: `python3 -m unittest -v` passes.
