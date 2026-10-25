import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { Button } from './Button';

/** Modal confirmation with focus trapping and Escape-to-cancel (Radix Dialog). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = 'primary',
  confirmDisabled = false,
  pending = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger';
  confirmDisabled?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl focus:outline-none">
          <Dialog.Title className="text-lg font-semibold text-slate-900">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-2 space-y-2 text-sm text-slate-700">{description}</div>
          </Dialog.Description>
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              variant={confirmVariant}
              disabled={confirmDisabled || pending}
              onClick={onConfirm}
            >
              {pending ? 'Working…' : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
