import { LOCAL_ACTOR } from '@/domain/audit';
import { newWorkspace, type Workspace } from '@/domain/workspace';
import type { NewAuditEvent } from '@/repositories';

/** Deterministic, schema-valid v4-shaped UUIDs for tests. */
export function sequentialIds(prefix = 0): () => string {
  let n = 0;
  return () => {
    n += 1;
    const tail = (prefix * 1_000_000 + n).toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${tail}`;
  };
}

/** A clock that starts at `start` and advances one minute per call. */
export function steppingClock(start = '2026-01-15T09:00:00.000Z'): () => Date {
  let t = Date.parse(start);
  return () => {
    const now = new Date(t);
    t += 60_000;
    return now;
  };
}

export function sampleWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    ...newWorkspace({
      id: '00000000-0000-4000-8000-00000000aaaa',
      name: 'Accra Transport Ltd',
      kind: 'business',
      now: new Date('2026-01-15T09:00:00.000Z'),
    }),
    ...overrides,
  };
}

export function sampleAuditEvent(
  id: string,
  workspaceId: string,
  overrides: Partial<NewAuditEvent> = {},
): NewAuditEvent {
  return {
    id,
    workspaceId,
    occurredAt: '2026-01-15T09:00:00.000Z',
    actor: LOCAL_ACTOR,
    action: 'workspace.created',
    entityType: 'workspace',
    entityId: workspaceId,
    summary: 'Workspace created',
    changes: [],
    ...overrides,
  };
}
