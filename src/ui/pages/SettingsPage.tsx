import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { workspaceNameSchema, workspaceSettingsSchema, type Workspace } from '@/domain/workspace';
import { CategoriesCard } from '../assets/CategoriesCard';
import { ExpenseCategoriesCard } from '../transactions/ExpenseCategoriesCard';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card, PageHeader } from '../components/Card';
import { Field, INPUT_CLASS } from '../components/Field';
import { WEEKDAYS } from '../format';
import { useUpdateWorkspace } from '../queries';

const settingsFormSchema = workspaceSettingsSchema
  .pick({ weekStartsOn: true, timeZone: true, backupReminderDays: true })
  .extend({ name: workspaceNameSchema });

type SettingsForm = z.infer<typeof settingsFormSchema>;

function timeZones(current: string): string[] {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes(current) ? zones : [current, ...zones];
}

export function SettingsPage({ workspace }: { workspace: Workspace }) {
  const update = useUpdateWorkspace();
  const zones = useMemo(
    () => timeZones(workspace.settings.timeZone),
    [workspace.settings.timeZone],
  );
  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      name: workspace.name,
      weekStartsOn: workspace.settings.weekStartsOn,
      timeZone: workspace.settings.timeZone,
      backupReminderDays: workspace.settings.backupReminderDays,
    },
  });
  const errors = form.formState.errors;

  async function save(values: SettingsForm) {
    const saved = await update.mutateAsync({
      name: values.name,
      settings: {
        ...workspace.settings,
        weekStartsOn: values.weekStartsOn,
        timeZone: values.timeZone,
        backupReminderDays: values.backupReminderDays,
      },
    });
    form.reset({ ...values, name: saved.name });
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Applies to this device’s workspace. Changes are recorded in the audit log."
      />
      <Card title="Workspace settings">
        <form noValidate className="max-w-xl space-y-4" onSubmit={form.handleSubmit(save)}>
          <Field label="Workspace name" error={errors.name?.message}>
            {(control) => <input {...control} {...form.register('name')} className={INPUT_CLASS} />}
          </Field>

          <Field
            label="Week starts on"
            hint="Used for weekly report periods."
            error={errors.weekStartsOn?.message}
          >
            {(control) => (
              <select
                {...control}
                {...form.register('weekStartsOn', { valueAsNumber: true })}
                className={INPUT_CLASS}
              >
                {WEEKDAYS.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field
            label="Business time zone"
            hint="Report periods and displayed times use this zone. Ghana uses Africa/Accra (UTC+0)."
            error={errors.timeZone?.message}
          >
            {(control) => (
              <select {...control} {...form.register('timeZone')} className={INPUT_CLASS}>
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field
            label="Backup reminder (days)"
            hint="Show a reminder when the last full backup is older than this."
            error={errors.backupReminderDays?.message}
          >
            {(control) => (
              <input
                {...control}
                {...form.register('backupReminderDays', { valueAsNumber: true })}
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                className={`${INPUT_CLASS} max-w-32`}
              />
            )}
          </Field>

          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-800">Reporting currency</p>
            <p className="text-sm text-slate-700">
              {workspace.settings.reportingCurrency} (Ghanaian cedi). Fixed for this release; other
              currencies are not accepted until a conversion policy is agreed.
            </p>
          </div>

          {update.isSuccess && !form.formState.isDirty && (
            <Alert tone="success" title="Settings saved" />
          )}
          {update.isError && (
            <Alert tone="danger" title="Settings were not saved">
              <p>{update.error.message}</p>
            </Alert>
          )}

          <Button type="submit" disabled={update.isPending || !form.formState.isDirty}>
            {update.isPending ? 'Saving…' : 'Save settings'}
          </Button>
        </form>
      </Card>
      <div className="mt-6">
        <CategoriesCard />
        <ExpenseCategoriesCard />
      </div>
    </>
  );
}
