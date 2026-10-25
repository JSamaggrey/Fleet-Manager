import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { AssetValidationError } from '@/application/asset-records';
import type { AssetDetail } from '@/application/asset-service';
import type { AssetCategory } from '@/domain/assets';
import { DEPRECIATION_CONVENTION } from '@/domain/depreciation';
import { formatMoney } from '@/domain/money';
import { Alert } from '../components/Alert';
import { Button, FOCUS_RING } from '../components/Button';
import { Card, DescriptionList, PageHeader } from '../components/Card';
import { Field, INPUT_CLASS } from '../components/Field';
import { ErrorState, LoadingState } from '../components/StateViews';
import {
  assetFormSchema,
  assetToForm,
  emptyAssetForm,
  formFieldFor,
  formToAssetInput,
  type AssetFormValues,
} from '../assets/form-values';
import { useAsset, useCategories, useCreateAsset, useUpdateAssetDetails } from '../queries';

export function NewAssetPage() {
  const categories = useCategories();
  if (categories.isPending) return <LoadingState label="Loading categories…" />;
  if (categories.isError)
    return <ErrorState title="Categories could not be loaded" error={categories.error} />;
  return <AssetForm categories={categories.data} />;
}

export function EditAssetPage() {
  const { id = '' } = useParams();
  const detail = useAsset(id);
  const categories = useCategories();
  if (detail.isPending || categories.isPending) return <LoadingState label="Loading asset…" />;
  if (detail.isError) return <ErrorState title="Asset could not be loaded" error={detail.error} />;
  if (categories.isError)
    return <ErrorState title="Categories could not be loaded" error={categories.error} />;
  return <AssetForm categories={categories.data} existing={detail.data} />;
}

function AssetForm({
  categories,
  existing,
}: {
  categories: AssetCategory[];
  existing?: AssetDetail;
}) {
  const navigate = useNavigate();
  const create = useCreateAsset();
  const update = useUpdateAssetDetails(existing?.asset.id ?? '');
  const mutation = existing ? update : create;
  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: existing ? assetToForm(existing.asset) : emptyAssetForm(),
  });
  const errors = form.formState.errors;
  const categoryId = useWatch({ control: form.control, name: 'categoryId' });
  const category = categories.find((c) => c.id === categoryId);
  const selectable = categories.filter((c) => !c.archived || c.id === existing?.asset.categoryId);

  async function submit(values: AssetFormValues) {
    const input = formToAssetInput(values, category?.usesVehicleFields ?? false);
    try {
      const asset = existing
        ? await update.mutateAsync(input.details)
        : await create.mutateAsync(input);
      navigate(`/assets/${asset.id}`);
    } catch (error) {
      if (error instanceof AssetValidationError) {
        const field = formFieldFor(error.field);
        if (field !== 'root') {
          form.setError(field, { message: error.message }, { shouldFocus: true });
          return;
        }
      }
      // Other errors are shown by the mutation's error alert.
    }
  }

  const text = (
    name: keyof AssetFormValues,
    label: string,
    opts: { hint?: string; autoComplete?: string } = {},
  ) => (
    <Field label={label} error={errors[name]?.message} {...(opts.hint ? { hint: opts.hint } : {})}>
      {(control) => (
        <input
          {...control}
          {...form.register(name)}
          autoComplete={opts.autoComplete ?? 'off'}
          className={INPUT_CLASS}
        />
      )}
    </Field>
  );

  return (
    <>
      <PageHeader
        title={existing ? `Edit ${existing.asset.code}` : 'Add asset'}
        description={
          existing
            ? 'Descriptive details. Depreciation assumptions change through a revision so history stays intact.'
            : 'The depreciation schedule is generated when you save.'
        }
      />
      <form noValidate onSubmit={form.handleSubmit(submit)} className="space-y-6">
        <Card title="Identification">
          <div className="grid gap-4 md:grid-cols-2">
            {text('code', 'Asset code', { hint: 'Unique in this workspace, e.g. GR-001.' })}
            {text('name', 'Name')}
            <Field label="Category" error={errors.categoryId?.message}>
              {(control) => (
                <select {...control} {...form.register('categoryId')} className={INPUT_CLASS}>
                  <option value="">Choose…</option>
                  {selectable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.archived ? ' (archived)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Acquisition date" error={errors.acquisitionDate?.message}>
              {(control) => (
                <input
                  {...control}
                  {...form.register('acquisitionDate')}
                  type="date"
                  className={INPUT_CLASS}
                />
              )}
            </Field>
            {text('location', 'Location (optional)')}
            {text('supplier', 'Supplier (optional)')}
          </div>
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

        {category?.usesVehicleFields && (
          <Card title="Vehicle details" description="All optional.">
            <div className="grid gap-4 md:grid-cols-3">
              {text('make', 'Make')}
              {text('model', 'Model')}
              <Field label="Year" error={errors.year?.message}>
                {(control) => (
                  <input
                    {...control}
                    {...form.register('year')}
                    inputMode="numeric"
                    maxLength={4}
                    className={INPUT_CLASS}
                  />
                )}
              </Field>
              {text('registration', 'Registration / plate')}
              {text('vin', 'Chassis / VIN')}
            </div>
          </Card>
        )}

        {existing ? (
          <Card title="Depreciation (read-only here)">
            <DescriptionList
              items={[
                ['Capitalised cost', formatMoney(existing.asset.depreciation.capitalizedCost)],
                ['Residual value', formatMoney(existing.asset.depreciation.residualValue)],
                ['Useful life', `${existing.asset.depreciation.usefulLifeMonths} months`],
                ['In service', existing.asset.depreciation.inServiceDate],
              ]}
            />
            <Link
              to={`/assets/${existing.asset.id}/revise`}
              className={`text-sm font-medium text-blue-800 underline ${FOCUS_RING}`}
            >
              Revise depreciation assumptions
            </Link>
          </Card>
        ) : (
          <Card title="Depreciation" description={DEPRECIATION_CONVENTION}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="In-service date"
                hint="Depreciation starts in this month."
                error={errors.inServiceDate?.message}
              >
                {(control) => (
                  <input
                    {...control}
                    {...form.register('inServiceDate')}
                    type="date"
                    className={INPUT_CLASS}
                  />
                )}
              </Field>
              <Field
                label="Useful life (months)"
                hint="e.g. 60 for 5 years."
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
                label="Capitalised cost (GHS)"
                hint="Purchase price plus costs to bring it into use. Not recorded as an operating expense."
                error={errors.capitalizedCost?.message}
              >
                {(control) => (
                  <input
                    {...control}
                    {...form.register('capitalizedCost')}
                    inputMode="decimal"
                    className={INPUT_CLASS}
                  />
                )}
              </Field>
              <Field
                label="Residual value (GHS)"
                hint="Expected value at the end of its useful life."
                error={errors.residualValue?.message}
              >
                {(control) => (
                  <input
                    {...control}
                    {...form.register('residualValue')}
                    inputMode="decimal"
                    className={INPUT_CLASS}
                  />
                )}
              </Field>
            </div>
          </Card>
        )}

        <Card title="Notes">
          <Field label="Notes (optional)" error={errors.notes?.message}>
            {(control) => (
              <textarea {...control} {...form.register('notes')} rows={3} className={INPUT_CLASS} />
            )}
          </Field>
        </Card>

        {mutation.isError &&
          !(
            mutation.error instanceof AssetValidationError &&
            formFieldFor(mutation.error.field) !== 'root'
          ) && (
            <Alert tone="danger" title="The asset was not saved">
              <p>{mutation.error.message}</p>
            </Alert>
          )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : existing ? 'Save changes' : 'Create asset'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate(existing ? `/assets/${existing.asset.id}` : '/assets')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
