import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { HashRouter, Link, Route, Routes } from 'react-router';
import type { Workspace } from '@/domain/workspace';
import { PageHeader } from '@/ui/components/Card';
import { ErrorState, LoadingState } from '@/ui/components/StateViews';
import { AppShell } from '@/ui/layout/AppShell';
import { DashboardPage } from '@/ui/pages/DashboardPage';
import { OnboardingPage } from '@/ui/pages/OnboardingPage';
import { createQueryClient, useWorkspace } from '@/ui/queries';
import { ServicesContext, type AppServices } from '@/ui/services';
import {
  AssetDetailPage,
  AssetsPage,
  AuditPage,
  BackupRestorePage,
  DepreciationPage,
  EditAssetPage,
  EditExpensePage,
  EditRevenuePage,
  ExceptionsPage,
  ExpenseDetailPage,
  ExpensesPage,
  NewAssetPage,
  NewExpensePage,
  NewRevenuePage,
  ReportsPage,
  RevenueDetailPage,
  RevenuePage,
  ReviseDepreciationPage,
  SettingsPage,
  TasksPage,
} from './lazy-pages';

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
        <Route path="assets" element={<AssetsPage />} />
        <Route path="assets/new" element={<NewAssetPage />} />
        <Route path="assets/:id" element={<AssetDetailPage workspace={workspace} />} />
        <Route path="assets/:id/edit" element={<EditAssetPage />} />
        <Route path="assets/:id/revise" element={<ReviseDepreciationPage />} />
        <Route path="depreciation" element={<DepreciationPage workspace={workspace} />} />
        <Route path="revenue" element={<RevenuePage />} />
        <Route path="revenue/new" element={<NewRevenuePage workspace={workspace} />} />
        <Route path="revenue/:id" element={<RevenueDetailPage workspace={workspace} />} />
        <Route path="revenue/:id/edit" element={<EditRevenuePage workspace={workspace} />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="expenses/new" element={<NewExpensePage workspace={workspace} />} />
        <Route path="expenses/:id" element={<ExpenseDetailPage workspace={workspace} />} />
        <Route path="expenses/:id/edit" element={<EditExpensePage workspace={workspace} />} />
        <Route path="reports" element={<ReportsPage workspace={workspace} />} />
        <Route path="exceptions" element={<ExceptionsPage />} />
        <Route path="tasks" element={<TasksPage />} />
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
