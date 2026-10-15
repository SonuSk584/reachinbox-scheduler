import { describe, expect, it } from 'vitest';
import { extractEmails, mergeUnique } from './emails';

describe('extractEmails', () => {
  it('finds addresses in CSV text, lowercases and de-duplicates', () => {
    const csv = 'name,email\nAnn,Ann@Example.com\nBob,bob@example.com\nAnn again,ann@example.com';
    expect(extractEmails(csv)).toEqual(['ann@example.com', 'bob@example.com']);
  });

  it('handles one-per-line and mixed separators', () => {
    expect(extractEmails('a@x.com; b@x.com,\nc@x.co.uk')).toEqual(['a@x.com', 'b@x.com', 'c@x.co.uk']);
  });

  it('returns an empty list when there is nothing valid', () => {
    expect(extractEmails('no emails here, just text@')).toEqual([]);
  });
});

describe('mergeUnique', () => {
  it('keeps order and drops repeats', () => {
    expect(mergeUnique(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });
});
