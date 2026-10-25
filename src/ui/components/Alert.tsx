import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { box: string; Icon: typeof Info }> = {
  info: { box: 'border-blue-200 bg-blue-50 text-blue-950', Icon: Info },
  success: { box: 'border-green-200 bg-green-50 text-green-950', Icon: CheckCircle2 },
  warning: { box: 'border-amber-300 bg-amber-50 text-amber-950', Icon: AlertTriangle },
  danger: { box: 'border-red-200 bg-red-50 text-red-950', Icon: XCircle },
};

export function Alert({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const { box, Icon } = TONES[tone];
  // Errors and successes are announced; informational notes are not.
  const role = tone === 'danger' ? 'alert' : tone === 'success' ? 'status' : undefined;
  return (
    <div role={role} className={`flex gap-3 rounded-md border p-3 text-sm ${box}`}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="space-y-1">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
