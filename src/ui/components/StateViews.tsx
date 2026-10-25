import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert } from './Alert';
import { Button } from './Button';

export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2 p-8 text-sm text-slate-600">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorState({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div className="p-4">
      <Alert
        tone="danger"
        title={title}
        action={
          onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )
        }
      >
        <p>{error instanceof Error ? error.message : 'An unexpected error occurred.'}</p>
      </Alert>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-600">{children}</div>}
    </div>
  );
}
