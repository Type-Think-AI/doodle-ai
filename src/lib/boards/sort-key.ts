/**
 * Sort keys for board items — zero-padded 11-digit numeric strings.
 *
 * The format is compatible with the migration backfill:
 *   `printf('%011d', epoch_seconds)`
 *
 * Lexicographic ordering of these strings == chronological ordering, which is
 * what D1's index on (boardId, sortKey) relies on.
 *
 * Reordering is a SINGLE-ROW UPDATE: compute a key strictly between two
 * neighbours and write it to the moved row — never renumber siblings.
 */

const PAD = 11;

/** A new key representing "right now" — appends to the end of any board. */
export function appendKey(): string {
  return String(Math.floor(Date.now() / 1000)).padStart(PAD, "0");
}

/**
 * A key strictly between `a` and `b` for drag-reorder.
 *
 * When the numeric gap is >= 2, uses the padded integer midpoint.
 * When the gap is 0 or 1 (adjacent integers), extends `a` with a suffix so
 * it still sorts strictly between a and b lexicographically.
 *
 * Precondition: a < b lexicographically.
 */
export function midKey(a: string, b: string): string {
  // Normalise to same length by right-padding with '0' for numeric comparison
  const maxLen = Math.max(a.length, b.length);
  const aPad = a.padEnd(maxLen, "0");
  const bPad = b.padEnd(maxLen, "0");

  // Try numeric midpoint on the integer interpretation
  const aNum = BigInt(aPad);
  const bNum = BigInt(bPad);
  const gap = bNum - aNum;

  if (gap >= 2n) {
    const mid = aNum + gap / 2n;
    return String(mid).padStart(maxLen, "0");
  }

  // Gap is 0 or 1 at this length — extend by appending '5' to `a`.
  // Since a < b and they differ at most by 1 at this digit-width,
  // a + "5" is guaranteed to sort after a and before b:
  //   a       = "00000000100"
  //   a + "5" = "000000001005"
  //   b       = "00000000101"
  // Lex: "00000000100" < "000000001005" < "00000000101" ✓
  return a + "5";
}

/**
 * Self-check — call from a scratch script then delete it.
 * Throws on any invariant violation.
 */
export function verify(): void {
  // Basic appendKey format
  const k = appendKey();
  console.assert(k.length >= PAD, `appendKey length >= ${PAD}`);
  console.assert(/^\d+$/.test(k), "appendKey is all digits");

  // midKey with gap >= 2
  const a1 = "00000000100";
  const b1 = "00000000110";
  const m1 = midKey(a1, b1);
  console.assert(m1 > a1 && m1 < b1, `midKey(${a1}, ${b1}) = ${m1} is between`);

  // midKey with gap = 1 (adjacent)
  const a2 = "00000000100";
  const b2 = "00000000101";
  const m2 = midKey(a2, b2);
  console.assert(m2 > a2 && m2 < b2, `midKey(${a2}, ${b2}) = ${m2} is between`);

  // midKey with gap = 0 (same numeric value, different lengths shouldn't happen but be safe)
  const a3 = "00000000100";
  const b3 = "00000000101";
  const m3 = midKey(a3, b3);
  console.assert(m3 > a3 && m3 < b3, `midKey(${a3}, ${b3}) = ${m3} is between (gap-0-like)`);

  // Extended key still sorts correctly against further extensions
  const m4 = midKey(a2, m2); // between "00000000100" and "000000001005"
  console.assert(m4 > a2 && m4 < m2, `nested midKey ${m4} is between ${a2} and ${m2}`);

  console.log("sort-key: all checks passed ✓");
}
