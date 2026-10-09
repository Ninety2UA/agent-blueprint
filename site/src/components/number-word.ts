const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** A count written as prose uses it ("in eight coding CLIs"); past twelve it stays a number. */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}
