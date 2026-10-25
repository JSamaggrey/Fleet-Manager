import { describe, expect, it } from 'vitest';
import { diffFields } from './audit-event';

describe('diffFields', () => {
  it('lists only changed fields, recursing into nested objects', () => {
    const before = { name: 'A', count: 1, settings: { a: 1, b: 'x' }, untracked: 1 };
    const after = { name: 'B', count: 1, settings: { a: 2, b: 'x' }, untracked: 2 };
    expect(diffFields(before, after, ['name', 'count', 'settings'])).toEqual([
      { field: 'name', before: 'A', after: 'B' },
      { field: 'settings.a', before: 1, after: 2 },
    ]);
  });

  it('records added and removed values as null on the missing side', () => {
    const before: Record<string, unknown> = { note: undefined };
    const after: Record<string, unknown> = { note: 'hello' };
    expect(diffFields(before, after, ['note'])).toEqual([
      { field: 'note', before: null, after: 'hello' },
    ]);
  });

  it('returns no changes for equal values', () => {
    expect(diffFields({ a: [1, 2] }, { a: [1, 2] }, ['a'])).toEqual([]);
  });
});
