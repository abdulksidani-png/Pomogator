/** The username friends see (asked once after signing in). Pure; tested in tests/unit/username.test.ts. */

/** 2–20 letters, numbers, spaces, . _ ' or -, and never an email address. '' if not allowed. */
export function cleanUsername(v: unknown): string {
  const n = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  return n.length >= 2 && n.length <= 20 && /^[\p{L}\p{N} _.'-]+$/u.test(n) ? n : '';
}
