import type { AuditEvent } from '@/domain/audit';
import { Card } from '../components/Card';
import { formatDateTime } from '../format';

const show = (value: unknown) =>
  value === null || value === undefined || value === '' ? '—' : String(value);

/** Audit trail for one record, newest first, with field-level changes for corrections. */
export function HistoryCard({ events, timeZone }: { events: AuditEvent[]; timeZone: string }) {
  return (
    <Card title="History" description="From the audit log. Entries cannot be edited or removed.">
      <ol className="space-y-3 text-sm">
        {events.map((event) => (
          <li key={event.id}>
            <p className="font-medium text-slate-900">{event.summary}</p>
            <p className="text-xs text-slate-500">
              {formatDateTime(event.occurredAt, timeZone)} · {event.action}
            </p>
            {event.action.endsWith('.updated') && event.changes.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">
                {event.changes.map((c) => (
                  <li key={c.field}>
                    {c.field}: {show(c.before)} → {show(c.after)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
