import { describe, expect, it } from 'vitest';
import { sampleWorkspace } from '@/test/fixtures';
import { backupStatus, newWorkspace, workspaceSchema } from './workspace';

describe('newWorkspace', () => {
  it('trims the name and applies defaults', () => {
    const ws = newWorkspace({
      id: '00000000-0000-4000-8000-000000000001',
      name: '  Fleet  ',
      kind: 'business',
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(ws).toMatchObject({
      name: 'Fleet',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastBackupAt: null,
      settings: { weekStartsOn: 1, timeZone: 'Africa/Accra', reportingCurrency: 'GHS' },
    });
  });

  it.each([
    ['empty name', { name: '' }],
    ['overlong name', { name: 'x'.repeat(81) }],
    ['bad id', { id: 'not-a-uuid' }],
  ])('rejects %s', (_label, override) => {
    expect(() =>
      newWorkspace({
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Fleet',
        kind: 'business',
        now: new Date(),
        ...override,
      }),
    ).toThrow();
  });

  it('rejects unknown fields (strict schema)', () => {
    expect(workspaceSchema.safeParse({ ...sampleWorkspace(), extra: 1 }).success).toBe(false);
  });

  it('rejects non-GHS reporting currency', () => {
    const ws = sampleWorkspace();
    const result = workspaceSchema.safeParse({
      ...ws,
      settings: { ...ws.settings, reportingCurrency: 'USD' },
    });
    expect(result.success).toBe(false);
  });
});

describe('backupStatus', () => {
  const now = new Date('2026-03-10T12:00:00.000Z');

  it('reports never when no backup was made', () => {
    expect(backupStatus(sampleWorkspace(), now)).toEqual({ state: 'never' });
  });

  it('is current inside the reminder window and overdue at the boundary', () => {
    const ws = (lastBackupAt: string) => sampleWorkspace({ lastBackupAt });
    expect(backupStatus(ws('2026-03-04T12:00:00.000Z'), now)).toEqual({
      state: 'current',
      daysSince: 6,
    });
    expect(backupStatus(ws('2026-03-03T12:00:00.000Z'), now)).toEqual({
      state: 'overdue',
      daysSince: 7,
    });
  });

  it('treats a future timestamp (device clock skew) as zero days', () => {
    expect(
      backupStatus(sampleWorkspace({ lastBackupAt: '2026-03-12T00:00:00.000Z' }), now),
    ).toEqual({ state: 'current', daysSince: 0 });
  });
});
