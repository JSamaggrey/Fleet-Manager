import { useId, type ReactNode } from 'react';

export const INPUT_CLASS =
  'block w-full min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-600 focus:outline-2 focus:outline-blue-600 aria-invalid:border-red-600 disabled:bg-slate-100';

interface ControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

/** Label, hint, and error wiring for one form control (passed via render prop). */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: (control: ControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && (
        <p id={hintId} className="text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
