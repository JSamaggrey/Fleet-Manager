import type { UseMutationResult } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useId, useState } from 'react';
import { VOID_REASON_MIN_LENGTH } from '@/domain/transactions';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { INPUT_CLASS } from '../components/Field';

/** "Void" button with a confirmation dialog that requires a reason. */
export function VoidAction({
  what,
  label,
  mutation,
}: {
  /** e.g. "revenue entry" */
  what: string;
  /** e.g. "TRIP-0101 on 2026-05-05, GH₵450.00" */
  label: string;
  mutation: UseMutationResult<unknown, Error, string>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const id = useId();
  const tooShort = reason.trim().length < VOID_REASON_MIN_LENGTH;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Ban aria-hidden="true" className="size-4" />
        Void
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) mutation.reset();
        }}
        title={`Void this ${what}?`}
        description={
          <>
            <p>{label}</p>
            <p>
              The record stays in the list and the audit log, marked as voided, but no total or
              report will include it. Voiding cannot be undone; to correct a mistake, record a new{' '}
              {what}.
            </p>
          </>
        }
        confirmLabel={`Void ${what}`}
        confirmVariant="danger"
        confirmDisabled={tooShort}
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate(reason, { onSuccess: () => setOpen(false) })}
      >
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
          Reason (required)
        </label>
        <textarea
          id={id}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          className={INPUT_CLASS}
        />
        {mutation.isError && (
          <div className="mt-3">
            <Alert tone="danger" title="Not voided">
              <p>{mutation.error.message}</p>
            </Alert>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
