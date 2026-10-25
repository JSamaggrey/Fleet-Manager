import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { HashRouter, Link, Route, Routes } from 'react-router';
import type { Workspace } from '@/domain/workspace';
import { PageHeader } from '@/ui/components/Card';
import { ErrorState, LoadingState } from '@/ui/components/StateViews';
import { AppShell } from '@/ui/layout/AppShell';
import { AuditPage } from '@/ui/pages/AuditPage';
import { BackupRestorePage } from '@/ui/pages/BackupRestorePage';
import { DashboardPage } from '@/ui/pages/DashboardPage';
import { OnboardingPage } from '@/ui/pages/OnboardingPage';
import { SettingsPage } from '@/ui/pages/SettingsPage';
import { createQueryClient, useWorkspace } from '@/ui/queries';
import { ServicesContext, type AppServices } from '@/ui/services';

function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Link to="/" className="text-blue-800 underline">
        Go to the dashboard
      </Link>
    </>
  );
}

function WorkspaceRoutes({ workspace }: { workspace: Workspace }) {
  return (
    <Routes>
      <Route element={<AppShell workspace={workspace} />}>
        <Route index element={<DashboardPage workspace={workspace} />} />
        <Route path="backup" element={<BackupRestorePage workspace={workspace} />} />
        <Route path="settings" element={<SettingsPage workspace={workspace} />} />
        <Route path="audit" element={<AuditPage workspace={workspace} />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function WorkspaceGate() {
  const workspace = useWorkspace();
  if (workspace.isPending) return <LoadingState label="Opening local workspace…" />;
  if (workspace.isError) {
    return (
      <ErrorState
        title="The local workspace could not be opened"
        error={workspace.error}
        onRetry={() => void workspace.refetch()}
      />
    );
  }
  return workspace.data ? <WorkspaceRoutes workspace={workspace.data} /> : <OnboardingPage />;
}

/**
 * Hash routing works from any static host or path without server rewrite rules, which keeps
 * offline installs simple.
 */
export function App({
  services,
  queryClient,
}: {
  services: AppServices;
  queryClient?: QueryClient;
}) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <ServicesContext value={services}>
      <QueryClientProvider client={client}>
        <HashRouter>
          <WorkspaceGate />
        </HashRouter>
      </QueryClientProvider>
    </ServicesContext>
  );
}
