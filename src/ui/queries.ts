import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssetDetailsInput,
  AssetInput,
  DepreciationAssumptionsInput,
} from '@/application/asset-records';
import type { CategoryInput } from '@/application/asset-service';
import type { ExpenseCategoryInput, ExpenseInput } from '@/application/expense-service';
import type { RevenueInput } from '@/application/revenue-service';
import type { WorkspaceUpdate } from '@/application/workspace-service';
import type { AssetStatus } from '@/domain/assets';
import type { CalendarRange } from '@/domain/periods';
import type { ValidatedBackup } from '@/backup/backup-service';
import type { PageRequest } from '@/repositories';
import { useServices } from './services';

/**
 * Data lives on this device, so queries must run regardless of network state ('always'), and
 * retries would only repeat a local failure.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { networkMode: 'always', retry: false },
      mutations: { networkMode: 'always', retry: false },
    },
  });
}

export const queryKeys = {
  workspace: ['workspace'] as const,
  audit: (page: PageRequest) => ['audit', page.offset, page.limit] as const,
  storage: ['storage'] as const,
};

export function useWorkspace() {
  const { workspace } = useServices();
  return useQuery({ queryKey: queryKeys.workspace, queryFn: () => workspace.getWorkspace() });
}

export function useAuditEvents(page: PageRequest) {
  const { workspace } = useServices();
  return useQuery({
    queryKey: queryKeys.audit(page),
    queryFn: () => workspace.listAuditEvents(page),
  });
}

function useRefresh() {
  const client = useQueryClient();
  return {
    /** After ordinary edits. */
    invalidate: () => client.invalidateQueries(),
    /** After the whole workspace is replaced or erased: drop every cached result. */
    reset: () => client.resetQueries(),
  };
}

export function useCreateWorkspace() {
  const { workspace } = useServices();
  const { reset } = useRefresh();
  return useMutation({
    mutationFn: (input: { kind: 'business'; name: string } | { kind: 'demo' }) =>
      input.kind === 'demo'
        ? workspace.createDemoWorkspace()
        : workspace.createWorkspace(input.name),
    onSuccess: reset,
  });
}

export function useUpdateWorkspace() {
  const { workspace } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (update: WorkspaceUpdate) => workspace.updateWorkspace(update),
    onSuccess: invalidate,
  });
}

export function useExportBackup() {
  const { workspace, backup, saveFile } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: async () => {
      const file = await backup.createBackup();
      saveFile(file);
      await workspace.recordBackupCreated(file.fileName, file.exportedAt);
      return file;
    },
    onSuccess: invalidate,
  });
}

export function useInspectBackup() {
  const { backup } = useServices();
  return useMutation({ mutationFn: (file: Blob) => backup.inspectFile(file) });
}

export function useRestoreBackup() {
  const { backup } = useServices();
  const { reset } = useRefresh();
  return useMutation({
    mutationFn: (validated: ValidatedBackup) => backup.restore(validated),
    onSuccess: reset,
  });
}

export function useEraseWorkspace() {
  const { workspace } = useServices();
  const { reset } = useRefresh();
  return useMutation({
    mutationFn: (confirmationName: string) => workspace.eraseWorkspace(confirmationName),
    onSuccess: reset,
  });
}

// ---- Assets and depreciation ------------------------------------------------------------------

export const assetKeys = {
  all: ['assets'] as const,
  detail: (id: string) => ['assets', id] as const,
  categories: ['categories'] as const,
  period: (period: string) => ['depreciation', period] as const,
};

export function useAssets() {
  const { assets } = useServices();
  return useQuery({ queryKey: assetKeys.all, queryFn: () => assets.listAssets() });
}

export function useAsset(id: string) {
  const { assets } = useServices();
  return useQuery({ queryKey: assetKeys.detail(id), queryFn: () => assets.getAsset(id) });
}

export function useCategories() {
  const { assets } = useServices();
  return useQuery({ queryKey: assetKeys.categories, queryFn: () => assets.listCategories() });
}

export function usePeriodReport(period: string) {
  const { depreciation } = useServices();
  return useQuery({
    queryKey: assetKeys.period(period),
    queryFn: () => depreciation.periodReport(period),
  });
}

export function useCreateAsset() {
  const { assets } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (input: AssetInput) => assets.createAsset(input),
    onSuccess: invalidate,
  });
}

export function useUpdateAssetDetails(id: string) {
  const { assets } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (details: AssetDetailsInput) => assets.updateAssetDetails(id, details),
    onSuccess: invalidate,
  });
}

export function useSetAssetStatus(id: string) {
  const { assets } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (status: AssetStatus) => assets.setAssetStatus(id, status),
    onSuccess: invalidate,
  });
}

export function usePreviewRevision(id: string) {
  const { assets } = useServices();
  return useMutation({
    mutationFn: (next: DepreciationAssumptionsInput) => assets.previewRevision(id, next),
  });
}

export function useReviseDepreciation(id: string) {
  const { assets } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (input: { next: DepreciationAssumptionsInput; reason: string }) =>
      assets.reviseDepreciation(id, input.next, input.reason),
    onSuccess: invalidate,
  });
}

export function useClosePeriods() {
  const { depreciation } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (through: string) => depreciation.closePeriods(through),
    onSuccess: invalidate,
  });
}

export function useCreateCategory() {
  const { assets } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (input: CategoryInput) => assets.createCategory(input),
    onSuccess: invalidate,
  });
}

// ---- Revenue and expenses ---------------------------------------------------------------------

export const activityKeys = {
  revenue: ['revenue'] as const,
  revenueEntry: (id: string) => ['revenue', id] as const,
  expenses: ['expenses'] as const,
  expense: (id: string) => ['expenses', id] as const,
  expenseCategories: ['expense-categories'] as const,
};

export function useRevenueList() {
  const { revenue } = useServices();
  return useQuery({ queryKey: activityKeys.revenue, queryFn: () => revenue.listRevenue() });
}

export function useRevenueEntry(id: string) {
  const { revenue } = useServices();
  return useQuery({
    queryKey: activityKeys.revenueEntry(id),
    queryFn: () => revenue.getRevenue(id),
  });
}

export function useRecordRevenue() {
  const { revenue } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (input: RevenueInput) => revenue.recordRevenue(input),
    onSuccess: invalidate,
  });
}

export function useUpdateRevenue(id: string) {
  const { revenue } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (input: RevenueInput) => revenue.updateRevenue(id, input),
    onSuccess: invalidate,
  });
}

export function useVoidRevenue(id: string) {
  const { revenue } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (reason: string) => revenue.voidRevenue(id, reason),
    onSuccess: invalidate,
  });
}

export function useExpenseList() {
  const { expenses } = useServices();
  return useQuery({ queryKey: activityKeys.expenses, queryFn: () => expenses.listExpenses() });
}

export function useExpense(id: string) {
  const { expenses } = useServices();
  return useQuery({ queryKey: activityKeys.expense(id), queryFn: () => expenses.getExpense(id) });
}

export function useRecordExpense() {
  const { expenses } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (input: ExpenseInput) => expenses.recordExpense(input),
    onSuccess: invalidate,
  });
}

export function useUpdateExpense(id: string) {
  const { expenses } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (input: ExpenseInput) => expenses.updateExpense(id, input),
    onSuccess: invalidate,
  });
}

export function useVoidExpense(id: string) {
  const { expenses } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (reason: string) => expenses.voidExpense(id, reason),
    onSuccess: invalidate,
  });
}

export function useExpenseCategories() {
  const { expenses } = useServices();
  return useQuery({
    queryKey: activityKeys.expenseCategories,
    queryFn: () => expenses.listExpenseCategories(),
  });
}

export function useCreateExpenseCategory() {
  const { expenses } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (name: string) => expenses.createExpenseCategory(name),
    onSuccess: invalidate,
  });
}

export function useUpdateExpenseCategory() {
  const { expenses } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (input: { id: string } & ExpenseCategoryInput) =>
      expenses.updateExpenseCategory(input.id, input),
    onSuccess: invalidate,
  });
}

// ---- Reports ----------------------------------------------------------------------------------

export function useProfitReport(range: CalendarRange, enabled = true) {
  const { reports } = useServices();
  return useQuery({
    queryKey: ['reports', 'profit', range.from, range.to],
    queryFn: () => reports.profitReport(range),
    enabled,
  });
}

export function useExceptions() {
  const { reports } = useServices();
  return useQuery({ queryKey: ['reports', 'exceptions'], queryFn: () => reports.exceptions() });
}

export type CsvKind = 'profit' | 'revenue' | 'expenses';

/** Builds a CSV report and hands it to the user. Nothing in the workspace changes. */
export function useExportCsv() {
  const { reports, saveFile } = useServices();
  return useMutation({
    mutationFn: async (input: { kind: CsvKind; range: CalendarRange }) => {
      const file =
        input.kind === 'profit'
          ? await reports.profitCsv(input.range)
          : input.kind === 'revenue'
            ? await reports.revenueCsv(input.range)
            : await reports.expenseCsv(input.range);
      saveFile(file);
      return file;
    },
  });
}

export function useUpdateCategory() {
  const { assets } = useServices();
  const { invalidate } = useRefresh();
  return useMutation({
    mutationFn: (input: { id: string } & CategoryInput & { archived: boolean }) =>
      assets.updateCategory(input.id, input),
    onSuccess: invalidate,
  });
}
