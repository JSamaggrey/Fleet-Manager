import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import type { AssetDetail } from '@/application/asset-service';
import { inServicePeriod, type RevisionPlan } from '@/domain/depreciation';
import { formatMoney, parseMoney, sum, toDecimalString } from '@/domain/money';
import { addMonths, compareYearMonth, formatYearMonth } from '@/domain/periods';
import { Alert } from '../components/Alert';
import { Button, FOCUS_RING } from '../components/Button';
import { Card, DescriptionList, PageHeader } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, INPUT_CLASS } from '../components/Field';
import { ErrorState, LoadingState } from '../components/StateViews';
import { ScheduleTable } from '../assets/ScheduleTable';
import { revisionFormSchema, type RevisionFormValues } from '../assets/form-values';
import { useAsset, usePreviewRevision, useReviseDepreciation } from '../queries';

export function ReviseDepreciationPage() {
  const { id = '' } = useParams();
  const detail = useAsset(id);
  if (detail.isPending) return <LoadingState label="Loading asset…" />;
  if (detail.isError) return <ErrorState title="Asset could not be loaded" error={detail.error} />;
  return <ReviseForm detail={detail.data} />;
}

function toAssumptions(values: RevisionFormValues) {
  return {
    method: 'straight-line' as const,
    capitalizedCost: parseMoney(values.capitalizedCost, 'GHS'),
    residualValue: parseMoney(values.residualValue, 'GHS'),
    usefulLifeMonths: values.usefulLifeMonths,
    inServiceDate: values.inServiceDate,
  };
}

function ReviseForm({ detail }: { detail: AssetDetail }) {
  const navigate = useNavigate();
  const { asset } = detail;
  const preview = usePreviewRevision(asset.id);
  const revise = useReviseDepreciation(asset.id);
  const [previewedFor, setPreviewedFor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const locked =
    detail.closedThrough !== null &&
    compareYearMonth(inServicePeriod(asset.depreciation), detail.closedThrough) <= 0;

  const form = useForm<RevisionFormValues>({
    resolver: zodResolver(revisionFormSchema),
    defaultValues: {
      capitalizedCost: toDecimalString(asset.depreciation.capitalizedCost),
      residualValue: toDecimalString(asset.depreciation.residualValue),
      usefulLifeMonths: asset.depreciation.usefulLifeMonths,
      inServiceDate: asset.depreciation.inServiceDate,
      reason: '',
    },
  });
  const errors = form.formState.errors;
  const watched = useWatch({ control: form.control });
  const currentKey = assumptionKey(watched);
  const plan: RevisionPlan | undefined = previewedFor === currentKey ? preview.data : undefined;

  async function runPreview(values: RevisionFormValues) {
    await preview.mutateAsync(toAssumptions(values));
    setPreviewedFor(assumptionKey(values));
  }

  function requestSave() {
    if (form.getValues('reason').trim().length < 3) {
      form.setError('reason', { message: 'Give a reason for the change.' }, { shouldFocus: true });
      return;
    }
    setConfirming(true);
  }

  async function save() {
    const values = form.getValues();
    await revise.mutateAsync({ next: toAssumptions(values), reason: values.reason });
    setConfirming(false);
    navigate(`/assets/${asset.id}`);
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link to={`/assets/${asset.id}`} className={`text-blue-800 underline ${FOCUS_RING}`}>
          {asset.code}
        </Link>
      </nav>
      <PageHeader
        title="Revise depreciation"
        description="Preview the new schedule before saving. A new schedule version is created and the previous one is kept."
      />

      <div className="space-y-6">
        {locked ? (
          <Alert
            tone="info"
            title={`Months through ${formatYearMonth(detail.closedThrough ?? '')} are closed`}
          >
            <p>
              Closed months keep their figures. You can revise the residual value and useful life;
              the remaining book value is spread over the remaining life from{' '}
              {formatYearMonth(detail.closedThrough ? addMonths(detail.closedThrough, 1) : '')}.
              Cost and in-service date are locked.
            </p>
          </Alert>
        ) : (
          <Alert tone="info" title="No closed months yet">
            <p>The whole schedule will be regenerated from the corrected assumptions.</p>
          </Alert>
        )}

        <Card title="New assumptions">
          <form noValidate className="space-y-4" onSubmit={form.handleSubmit(runPreview)}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Capitalised cost (GHS)"
                error={errors.capitalizedCost?.message}
                {...(locked ? { hint: 'Locked: months are closed.' } : {})}
              >
                {(control) => (
                  <input
                    {...control}
                    {...form.register('capitalizedCost')}
                    readOnly={locked}
                    inputMode="decimal"
                    className={INPUT_CLASS}
                  />
                )}
              </Field>
              <Field label="Residual value (GHS)" error={errors.residualValue?.message}>
                {(control) => (
                  <input
                    {...control}
                    {...form.register('residualValue')}
                    inputMode="decimal"
                    className={INPUT_CLASS}
                  />
                )}
              </Field>
              <Field
                label="Useful life (months, total from in-service)"
                error={errors.usefulLifeMonths?.message}
              >
                {(control) => (
                  <input
                    {...control}
                    {...form.register('usefulLifeMonths', { valueAsNumber: true })}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={600}
                    className={INPUT_CLASS}
                  />
                )}
              </Field>
              <Field
                label="In-service date"
                error={errors.inServiceDate?.message}
                {...(locked ? { hint: 'Locked: months are closed.' } : {})}
              >
                {(control) => (
                  <input
                    {...control}
                    {...form.register('inServiceDate')}
                    readOnly={locked}
                    type="date"
                    className={INPUT_CLASS}
                  />
                )}
              </Field>
            </div>
            <Field
              label="Reason for the change"
              hint="Recorded in the audit log and schedule history."
              error={errors.reason?.message}
            >
              {(control) => (
                <input {...control} {...form.register('reason')} className={INPUT_CLASS} />
              )}
            </Field>
            <Button type="submit" variant="secondary" disabled={preview.isPending}>
              {preview.isPending ? 'Calculating…' : 'Preview new schedule'}
            </Button>
          </form>
        </Card>

        {preview.isError && (
          <Alert tone="danger" title="Preview failed">
            <p>{preview.error.message}</p>
          </Alert>
        )}

        {plan && !plan.ok && (
          <Alert tone="warning" title="This revision cannot be applied">
            <p>{plan.message}</p>
          </Alert>
        )}

        {plan?.ok && (
          <Card title="Preview" description="Nothing has been saved yet.">
            <DescriptionList
              items={[
                ['Takes effect from', formatYearMonth(plan.effectiveFrom)],
                ['Months kept unchanged', String(plan.preserved.length)],
                ['New monthly charge', plan.lines[0] ? formatMoney(plan.lines[0].charge) : '—'],
                [
                  'Final month',
                  plan.lines.at(-1) ? formatYearMonth(plan.lines.at(-1)?.period ?? '') : '—',
                ],
                [
                  'Total depreciation over life',
                  formatMoney(
                    sum(
                      [...plan.preserved, ...plan.lines].map((l) => l.charge),
                      'GHS',
                    ),
                  ),
                ],
              ]}
            />
            <ScheduleTable
              lines={[...plan.preserved, ...plan.lines]}
              closedThrough={detail.closedThrough}
              currentPeriod={detail.currentPeriod}
              caption="Previewed depreciation schedule"
              maxHeightClass="max-h-80"
            />
            <Button onClick={requestSave}>Save revision…</Button>
          </Card>
        )}

        {revise.isError && (
          <Alert tone="danger" title="The revision was not saved">
            <p>{revise.error.message}</p>
          </Alert>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Save this depreciation revision?"
        description={
          <p>
            A new schedule version for {asset.code} takes effect from{' '}
            {plan?.ok ? formatYearMonth(plan.effectiveFrom) : ''}. The change is recorded in the
            audit log.
          </p>
        }
        confirmLabel="Save revision"
        pending={revise.isPending}
        onConfirm={() => void save().catch(() => setConfirming(false))}
      />
    </>
  );
}

/** Identifies the assumptions a preview was made for, so edits after previewing require a new preview. */
function assumptionKey(v: Partial<RevisionFormValues>): string {
  return JSON.stringify([v.capitalizedCost, v.residualValue, v.usefulLifeMonths, v.inServiceDate]);
}
