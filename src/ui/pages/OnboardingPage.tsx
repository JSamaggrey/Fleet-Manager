import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { workspaceNameSchema } from '@/domain/workspace';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Field, INPUT_CLASS } from '../components/Field';
import { RestoreFromFile } from '../backup/RestoreFromFile';
import { requestPersistentStorage } from '../device-status';
import { useCreateWorkspace } from '../queries';

const createSchema = z.object({ name: workspaceNameSchema });

export function OnboardingPage() {
  const navigate = useNavigate();
  const create = useCreateWorkspace();
  const form = useForm({ resolver: zodResolver(createSchema), defaultValues: { name: '' } });

  async function start(input: { kind: 'business'; name: string } | { kind: 'demo' }) {
    // Ask while we have a user gesture; browsers may still decline.
    void requestPersistentStorage();
    await create.mutateAsync(input);
    navigate('/');
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-sm font-medium text-blue-800">Fleet &amp; Asset Management</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-900">Set up this device</h1>
          <p className="mt-2 text-slate-700">
            Everything you record is stored in this browser on this device and works without
            internet.
          </p>
        </header>

        <Alert tone="info" title="Each device has its own separate workspace">
          <p>
            Work is <strong>not</strong> shared or synchronised between devices. To move data to
            another device, download a full backup here and restore it there. Browser storage can be
            cleared, so back up regularly and keep backups somewhere safe.
          </p>
        </Alert>

        {create.isError && (
          <Alert tone="danger" title="The workspace could not be created">
            <p>{create.error.message}</p>
          </Alert>
        )}

        <Card
          title="Create a new workspace"
          description="Start with an empty workspace for your business."
        >
          <form
            noValidate
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => start({ kind: 'business', name: values.name }))}
          >
            <Field
              label="Workspace name"
              hint="Usually your business name. You can change it later."
              error={form.formState.errors.name?.message}
            >
              {(control) => (
                <input
                  {...control}
                  {...form.register('name')}
                  autoComplete="organization"
                  className={INPUT_CLASS}
                />
              )}
            </Field>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create workspace'}
            </Button>
          </form>
        </Card>

        <Card
          title="Restore from a backup file"
          description="Use a full backup exported from this app, for example to move a workspace to this device."
        >
          <RestoreFromFile onRestored={() => navigate('/')} />
        </Card>

        <Card
          title="Explore with a demo workspace"
          description="A clearly labelled practice workspace. Erase it from Backup & Restore when you are ready to start for real."
        >
          <Button
            variant="secondary"
            disabled={create.isPending}
            onClick={() => void start({ kind: 'demo' })}
          >
            Open demo workspace
          </Button>
        </Card>
      </div>
    </main>
  );
}
