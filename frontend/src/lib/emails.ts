const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Pull every email address out of free text (CSV, one-per-line, pasted text), de-duplicated. */
export function extractEmails(text: string): string[] {
  const found = text.match(EMAIL_PATTERN) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

export const mergeUnique = (a: string[], b: string[]) => [...new Set([...a, ...b])];
