import { lazy } from 'react';

/**
 * Pages loaded on first visit, so startup parses less JavaScript. The service worker precaches
 * every chunk, so they still open offline. Dashboard and onboarding stay in the main bundle.
 */
export const AssetsPage = lazy(() =>
  import('@/ui/pages/AssetsPage').then((m) => ({ default: m.AssetsPage })),
);
export const AssetDetailPage = lazy(() =>
  import('@/ui/pages/AssetDetailPage').then((m) => ({ default: m.AssetDetailPage })),
);
export const NewAssetPage = lazy(() =>
  import('@/ui/pages/AssetFormPage').then((m) => ({ default: m.NewAssetPage })),
);
export const EditAssetPage = lazy(() =>
  import('@/ui/pages/AssetFormPage').then((m) => ({ default: m.EditAssetPage })),
);
export const ReviseDepreciationPage = lazy(() =>
  import('@/ui/pages/ReviseDepreciationPage').then((m) => ({
    default: m.ReviseDepreciationPage,
  })),
);
export const DepreciationPage = lazy(() =>
  import('@/ui/pages/DepreciationPage').then((m) => ({ default: m.DepreciationPage })),
);
export const RevenuePage = lazy(() =>
  import('@/ui/pages/RevenuePage').then((m) => ({ default: m.RevenuePage })),
);
export const RevenueDetailPage = lazy(() =>
  import('@/ui/pages/RevenueDetailPage').then((m) => ({ default: m.RevenueDetailPage })),
);
export const NewRevenuePage = lazy(() =>
  import('@/ui/pages/RevenueFormPage').then((m) => ({ default: m.NewRevenuePage })),
);
export const EditRevenuePage = lazy(() =>
  import('@/ui/pages/RevenueFormPage').then((m) => ({ default: m.EditRevenuePage })),
);
export const ExpensesPage = lazy(() =>
  import('@/ui/pages/ExpensesPage').then((m) => ({ default: m.ExpensesPage })),
);
export const ExpenseDetailPage = lazy(() =>
  import('@/ui/pages/ExpenseDetailPage').then((m) => ({ default: m.ExpenseDetailPage })),
);
export const NewExpensePage = lazy(() =>
  import('@/ui/pages/ExpenseFormPage').then((m) => ({ default: m.NewExpensePage })),
);
export const EditExpensePage = lazy(() =>
  import('@/ui/pages/ExpenseFormPage').then((m) => ({ default: m.EditExpensePage })),
);
export const ReportsPage = lazy(() =>
  import('@/ui/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
export const ExceptionsPage = lazy(() =>
  import('@/ui/pages/ExceptionsPage').then((m) => ({ default: m.ExceptionsPage })),
);
export const BackupRestorePage = lazy(() =>
  import('@/ui/pages/BackupRestorePage').then((m) => ({ default: m.BackupRestorePage })),
);
export const SettingsPage = lazy(() =>
  import('@/ui/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
export const AuditPage = lazy(() =>
  import('@/ui/pages/AuditPage').then((m) => ({ default: m.AuditPage })),
);
