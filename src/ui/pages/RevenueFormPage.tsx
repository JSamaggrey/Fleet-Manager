import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ValidationError } from '@/application/errors';
import type { RevenueDetail } from '@/application/revenue-service';
import { PAYMENT_STATUS_LABEL, RECOGNITION_BASIS } from '@/domain/transactions';
import type { Workspace } from '@/domain/workspace';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card, PageHeader } from '../components/Card';
import { Field, INPUT_CLASS } from '../components/Field';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useAssets, useRecordRevenue, useRevenueEntry, useUpdateRevenue } from '../queries';
import {
  UNASSIGNED,
  amountFromRate,
  emptyRevenueForm,
  fieldFor,
  formToRevenueInput,
  revenueFormSchema,
  revenueToForm,
  type RevenueFormValues,
} from '../transactions/form-values';
import { assetOptions, useToday } from '../transactions/list-helpers';

const FIELDS = Object.keys(revenueFormSchema.shape) as (keyof RevenueFormValues)[];

export function NewRevenuePage({ workspace }: { workspace: Workspace }) {
  return <RevenueFormLoader workspace={workspace} />;
}

export function EditRevenuePage({ workspace }: { workspace: Workspace }) {
  const { id = '' } = useParams();
  const entry = useRevenueEntry(id);
  if (entry.isPending) return <LoadingState label="Loading revenue entry…" />;
  if (entry.isError)
    return <ErrorState title="Revenue entry could not be loaded" error={entry.error} />;
  if (entry.data.entry.void) {
    return (
      <Alert tone="warning" title="This entry is voided">
        <p>Voided entries cannot be edited. Record a new entry instead.</p>
      </Alert>
    );
  }
  return <RevenueFormLoader workspace={workspace} existing={entry.data} />;
}

function RevenueFormLoader({
  workspace,
  existing,
}: {
  workspace: Workspace;
  existing?: RevenueDetail;
}) {
  const assets = useAssets();
  if (assets.isPending) return <LoadingState label="Loading assets…" />;
  if (assets.isError) return <ErrorState title="Assets could not be loaded" error={assets.error} />;
  const options = assetOptions(
    assets.data.items.filter(
      (i) => i.asset.status === 'active' || i.asset.id === existing?.entry.assetId,
    ),
  );
  return <RevenueForm workspace={workspace} existing={existing} assetChoices={options} />;
}

function RevenueForm({
  workspace,
  existing,
  assetChoices,
}: {
  workspace: Workspace;
  existing: RevenueDetail | undefined;
  assetChoices: { value: string; label: string }[];
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = useToday(workspace);
  const record = useRecordRevenue();
  const update = useUpdateRevenue(existing?.entry.id ?? '');
  const mutation = existing ? update : record;
  const presetAsset = assetChoices.some((o) => o.value === params.get('asset'))
    ? (params.get('asset') ?? '')
    : '';
  const form = useForm<RevenueFormValues>({
    resolver: zodResolver(revenueFormSchema),
    defaultValues: existing ? revenueToForm(existing.entry) : emptyRevenueForm(today, presetAsset),
  });
  const errors = form.formState.errors;
  const [assetId, quantity, rate] = useWatch({
    control: form.control,
    name: ['assetId', 'quantity', 'rate'],
  });
  const suggested = amountFromRate(quantity, rate);

  async function submit(values: RevenueFormValues) {
    try {
      const saved = await mutation.mutateAsync(formToRevenueInput(values));
      navigate(`/revenue/${saved.id}`);
    } catch (error) {
      if (error instanceof ValidationError) {
        const field = fieldFor(error.field, FIELDS);
        if (field !== 'root')
          form.setError(field, { message: error.message }, { shouldFocus: true });
      }
    }
  }

  const text = (name: keyof RevenueFormValues, label: string, hint?: string) => (
    <Field label={label} error={errors[name]?.message} {...(hint ? { hint } : {})}>
      {(control) => (
        <input {...control} {...form.register(name)} autoComplete="off" className={INPUT_CLASS} />
      )}
    </Field>
  );

  return (
    <>
      <PageHeader
        title={existing ? `Correct ${existing.entry.reference}` : 'Record revenue'}
        description={
          existing
            ? 'Every changed field is recorded in the audit log.'
            : 'A completed trip, job or contract amount.'
        }
      />
      <form noValidate onSubmit={form.handleSubmit(submit)} className="space-y-6">
        <Card title="Trip or job" description={RECOGNITION_BASIS}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Service date"
              hint="The day the service was provided. Revenue counts in this month."
              error={errors.serviceDate?.message}
            >
              {(control) => (
                <input
                  {...control}
                  {...form.register('serviceDate')}
                  type="date"
                  max={today}
                  className={INPUT_CLASS}
                />
              )}
            </Field>
            {text(
              'reference',
              'Trip / job / contract reference',
              'e.g. TRIP-0101 or a waybill number.',
            )}
            <Field
              label="Asset"
              hint="The vehicle or asset that earned this revenue."
              error={errors.assetId?.message}
            >
              {(control) => (
                <select {...control} {...form.register('assetId')} className={INPUT_CLASS}>
                  <option value="">Choose…</option>
                  {assetChoices.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  <option value={UNASSIGNED}>Unassigned — assign later</option>
                </select>
              )}
            </Field>
            {text('customer', 'Customer / contract (optional)')}
          </div>
          {assetId === UNASSIGNED && (
            <Alert tone="warning" title="Unassigned revenue">
              <p>
                It counts in fleet revenue but in no asset’s results, and is listed as needing
                attention until you assign an asset.
              </p>
            </Alert>
          )}
          <Field label="Description (optional)" error={errors.description?.message}>
            {(control) => (
              <textarea
                {...control}
                {...form.register('description')}
                rows={2}
                className={INPUT_CLASS}
              />
            )}
          </Field>
        </Card>

        <Card title="Route and rate" description="All optional.">
          <div className="grid gap-4 md:grid-cols-2">
            {text('origin', 'Origin')}
            {text('destination', 'Destination')}
            <Field
              label="Distance / quantity"
              hint="e.g. 250 (km), 3 (trips)."
              error={errors.quantity?.message}
            >
              {(control) => (
                <input
                  {...control}
                  {...form.register('quantity')}
                  inputMode="decimal"
                  className={INPUT_CLASS}
                />
              )}
            </Field>
            {text('quantityUnit', 'Unit', 'e.g. km, trips, tonnes.')}
            <Field label="Rate per unit (GHS)" error={errors.rate?.message}>
              {(control) => (
                <input
                  {...control}
                  {...form.register('rate')}
                  inputMode="decimal"
                  className={INPUT_CLASS}
                />
              )}
            </Field>
          </div>
        </Card>

        <Card title="Amount">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Amount (GHS)"
              hint="The amount earned. It is not calculated automatically."
              error={errors.amount?.message}
            >
              {(control) => (
                <input
                  {...control}
                  {...form.register('amount')}
                  inputMode="decimal"
                  className={INPUT_CLASS}
                />
              )}
            </Field>
            <Field
              label="Payment status (optional)"
              hint="For reference only; it does not change when revenue counts."
              error={errors.paymentStatus?.message}
            >
              {(control) => (
                <select {...control} {...form.register('paymentStatus')} className={INPUT_CLASS}>
                  <option value="">Not recorded</option>
                  {Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          {suggested !== null && (
            <p className="text-sm text-slate-700">
              Quantity × rate = GHS {suggested}.{' '}
              <Button
                variant="ghost"
                className="underline"
                onClick={() => form.setValue('amount', suggested, { shouldValidate: true })}
              >
                Use as amount
              </Button>
            </p>
          )}
          <Field label="Notes (optional)" error={errors.notes?.message}>
            {(control) => (
              <textarea {...control} {...form.register('notes')} rows={2} className={INPUT_CLASS} />
            )}
          </Field>
        </Card>

        {mutation.isError &&
          !(
            mutation.error instanceof ValidationError &&
            fieldFor(mutation.error.field, FIELDS) !== 'root'
          ) && (
            <Alert tone="danger" title="Not saved">
              <p>{mutation.error.message}</p>
            </Alert>
          )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : existing ? 'Save correction' : 'Record revenue'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate(existing ? `/revenue/${existing.entry.id}` : '/revenue')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
