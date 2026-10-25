import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ValidationError } from '@/application/errors';
import type { ExpenseDetail } from '@/application/expense-service';
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  RECOGNITION_BASIS,
  type ExpenseCategory,
} from '@/domain/transactions';
import type { Workspace } from '@/domain/workspace';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card, PageHeader } from '../components/Card';
import { Field, INPUT_CLASS } from '../components/Field';
import { ErrorState, LoadingState } from '../components/StateViews';
import {
  useAssets,
  useExpense,
  useExpenseCategories,
  useRecordExpense,
  useUpdateExpense,
} from '../queries';
import {
  emptyExpenseForm,
  expenseFormSchema,
  expenseToForm,
  fieldFor,
  formToExpenseInput,
  type ExpenseFormValues,
} from '../transactions/form-values';
import { assetOptions, useToday } from '../transactions/list-helpers';

const FIELDS = Object.keys(expenseFormSchema.shape) as (keyof ExpenseFormValues)[];

const ASSIGNMENTS = [
  {
    value: 'asset',
    label: 'Direct — one asset',
    hint: 'Deducted in that asset’s management profit.',
  },
  {
    value: 'shared',
    label: 'Shared / fleet',
    hint: 'Overheads such as depot rent. Shown separately and deducted only at fleet level; never split across assets.',
  },
  {
    value: 'unassigned',
    label: 'Unassigned — decide later',
    hint: 'Listed as needing attention until classified.',
  },
] as const;

export function NewExpensePage({ workspace }: { workspace: Workspace }) {
  return <ExpenseFormLoader workspace={workspace} />;
}

export function EditExpensePage({ workspace }: { workspace: Workspace }) {
  const { id = '' } = useParams();
  const expense = useExpense(id);
  if (expense.isPending) return <LoadingState label="Loading expense…" />;
  if (expense.isError)
    return <ErrorState title="Expense could not be loaded" error={expense.error} />;
  if (expense.data.expense.void) {
    return (
      <Alert tone="warning" title="This expense is voided">
        <p>Voided expenses cannot be edited. Record a new expense instead.</p>
      </Alert>
    );
  }
  return <ExpenseFormLoader workspace={workspace} existing={expense.data} />;
}

function ExpenseFormLoader({
  workspace,
  existing,
}: {
  workspace: Workspace;
  existing?: ExpenseDetail;
}) {
  const assets = useAssets();
  const categories = useExpenseCategories();
  if (assets.isPending || categories.isPending) return <LoadingState label="Loading…" />;
  if (assets.isError) return <ErrorState title="Assets could not be loaded" error={assets.error} />;
  if (categories.isError)
    return <ErrorState title="Expense categories could not be loaded" error={categories.error} />;
  const options = assetOptions(
    assets.data.items.filter(
      (i) => i.asset.status === 'active' || i.asset.id === existing?.expense.assetId,
    ),
  );
  return (
    <ExpenseForm
      workspace={workspace}
      existing={existing}
      assetChoices={options}
      categories={categories.data.filter(
        (c) => !c.archived || c.id === existing?.expense.categoryId,
      )}
    />
  );
}

function ExpenseForm({
  workspace,
  existing,
  assetChoices,
  categories,
}: {
  workspace: Workspace;
  existing: ExpenseDetail | undefined;
  assetChoices: { value: string; label: string }[];
  categories: ExpenseCategory[];
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = useToday(workspace);
  const record = useRecordExpense();
  const update = useUpdateExpense(existing?.expense.id ?? '');
  const mutation = existing ? update : record;
  const presetAsset = assetChoices.some((o) => o.value === params.get('asset'))
    ? (params.get('asset') ?? '')
    : '';
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: existing
      ? expenseToForm(existing.expense)
      : emptyExpenseForm(today, presetAsset),
  });
  const errors = form.formState.errors;
  const [assignment, nature] = useWatch({ control: form.control, name: ['assignment', 'nature'] });

  async function submit(values: ExpenseFormValues) {
    try {
      const saved = await mutation.mutateAsync(formToExpenseInput(values));
      navigate(`/expenses/${saved.id}`);
    } catch (error) {
      if (error instanceof ValidationError) {
        const field = fieldFor(error.field, FIELDS);
        if (field !== 'root')
          form.setError(field, { message: error.message }, { shouldFocus: true });
      }
    }
  }

  const text = (name: keyof ExpenseFormValues, label: string) => (
    <Field label={label} error={errors[name]?.message}>
      {(control) => (
        <input {...control} {...form.register(name)} autoComplete="off" className={INPUT_CLASS} />
      )}
    </Field>
  );

  return (
    <>
      <PageHeader
        title={existing ? 'Correct expense' : 'Record expense'}
        description={
          existing
            ? 'Every changed field, including its classification, is recorded in the audit log.'
            : 'An operating cost of one asset, a shared fleet cost, or a capital item.'
        }
      />
      <form noValidate onSubmit={form.handleSubmit(submit)} className="space-y-6">
        <Card title="What it applies to">
          <fieldset aria-describedby={errors.assignment ? 'assignment-error' : undefined}>
            <legend className="sr-only">What this expense applies to</legend>
            <div className="grid gap-3 md:grid-cols-3">
              {ASSIGNMENTS.map((a) => (
                <label
                  key={a.value}
                  className="flex cursor-pointer gap-3 rounded-md border border-slate-300 p-3 text-sm has-checked:border-blue-600 has-checked:bg-blue-50"
                >
                  <input
                    type="radio"
                    value={a.value}
                    {...form.register('assignment')}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium text-slate-900">{a.label}</span>
                    <span className="block text-slate-600">{a.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.assignment && (
              <p id="assignment-error" className="mt-2 text-sm text-red-700">
                {errors.assignment.message}
              </p>
            )}
          </fieldset>
          {assignment === 'asset' && (
            <Field label="Asset" error={errors.assetId?.message}>
              {(control) => (
                <select {...control} {...form.register('assetId')} className={INPUT_CLASS}>
                  <option value="">Choose…</option>
                  {assetChoices.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </Card>

        <Card title="Expense" description={RECOGNITION_BASIS}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Expense date"
              hint="When the cost was incurred. It counts in this month."
              error={errors.expenseDate?.message}
            >
              {(control) => (
                <input
                  {...control}
                  {...form.register('expenseDate')}
                  type="date"
                  max={today}
                  className={INPUT_CLASS}
                />
              )}
            </Field>
            <Field label="Category" error={errors.categoryId?.message}>
              {(control) => (
                <select {...control} {...form.register('categoryId')} className={INPUT_CLASS}>
                  <option value="">Choose…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.archived ? ' (archived)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Amount (GHS)" error={errors.amount?.message}>
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
              label="Type"
              hint="Capital items are kept for the record but are not operating expenses."
              error={errors.nature?.message}
            >
              {(control) => (
                <select {...control} {...form.register('nature')} className={INPUT_CLASS}>
                  <option value="operating">Operating expense</option>
                  <option value="capital">Capital — acquisition or improvement</option>
                </select>
              )}
            </Field>
            {text('vendor', 'Vendor (optional)')}
            {text('reference', 'Receipt / reference (optional)')}
          </div>
          {nature === 'capital' && (
            <Alert tone="info" title="Capital item">
              <p>
                This amount will not be deducted as an operating expense. To include an improvement
                in depreciation, revise the asset’s cost from its page.
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

        <Card
          title="Payment"
          description="Optional, for reference. It does not change when the expense counts."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Payment status" error={errors.paymentStatus?.message}>
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
            <Field label="Payment method" error={errors.paymentMethod?.message}>
              {(control) => (
                <select {...control} {...form.register('paymentMethod')} className={INPUT_CLASS}>
                  <option value="">Not recorded</option>
                  {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
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
            {mutation.isPending ? 'Saving…' : existing ? 'Save correction' : 'Record expense'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate(existing ? `/expenses/${existing.expense.id}` : '/expenses')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
