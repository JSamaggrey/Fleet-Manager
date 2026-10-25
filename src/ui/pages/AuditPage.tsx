import { useState } from 'react';
import type { AuditChange } from '@/domain/audit';
import type { Workspace } from '@/domain/workspace';
import { Button } from '../components/Button';
import { PageHeader } from '../components/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { formatDateTime } from '../format';
import { useAuditEvents } from '../queries';

const PAGE_SIZE = 25;

function formatValue(value: AuditChange['before']): string {
  return value === null ? '—' : typeof value === 'string' ? value : JSON.stringify(value);
}

export function AuditPage({ workspace }: { workspace: Workspace }) {
  const [offset, setOffset] = useState(0);
  const audit = useAuditEvents({ offset, limit: PAGE_SIZE });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Material changes to this device’s workspace, newest first. The log cannot be edited."
      />
      {audit.isPending && <LoadingState label="Loading audit log…" />}
      {audit.isError && (
        <ErrorState
          title="The audit log could not be loaded"
          error={audit.error}
          onRetry={() => void audit.refetch()}
        />
      )}
      {audit.data && audit.data.total === 0 && <EmptyState title="No audit events yet" />}
      {audit.data && audit.data.total > 0 && (
        <>
          <div
            className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm"
            tabIndex={0}
            role="region"
            aria-label="Audit events"
          >
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Audit events</caption>
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    #
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    When
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Event
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Changes
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    By
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audit.data.items.map((event) => (
                  <tr key={event.id} className="align-top">
                    <td className="px-4 py-2 text-slate-500 tabular-nums">{event.sequence}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {formatDateTime(event.occurredAt, workspace.settings.timeZone)}
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{event.summary}</p>
                      <p className="text-xs text-slate-500">{event.action}</p>
                    </td>
                    <td className="px-4 py-2">
                      {event.changes.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {event.changes.map((change) => (
                            <li key={change.field}>
                              <span className="font-medium">{change.field}</span>:{' '}
                              {formatValue(change.before)} → {formatValue(change.after)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{event.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-700">
            <p>
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, audit.data.total)} of{' '}
              {audit.data.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={offset === 0}
                onClick={() => setOffset(offset - PAGE_SIZE)}
              >
                Newer
              </Button>
              <Button
                variant="secondary"
                disabled={offset + PAGE_SIZE >= audit.data.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Older
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
