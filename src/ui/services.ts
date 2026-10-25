import { createContext, useContext } from 'react';
import type { AssetService } from '@/application/asset-service';
import type { DepreciationService } from '@/application/depreciation-service';
import type { ExpenseService } from '@/application/expense-service';
import type { RevenueService } from '@/application/revenue-service';
import type { WorkspaceService } from '@/application/workspace-service';
import type { BackupService } from '@/backup/backup-service';
import type { ReportService } from '@/application/report-service';
import type { SavedFile } from './backup/download';

/** Everything the UI may call. Built in src/app (composition root) and injected via context. */
export interface AppServices {
  workspace: WorkspaceService;
  assets: AssetService;
  depreciation: DepreciationService;
  revenue: RevenueService;
  expenses: ExpenseService;
  reports: ReportService;
  backup: BackupService;
  /** Hands a generated file to the user (browser download in production). */
  saveFile: (file: SavedFile) => void;
  now: () => Date;
  appVersion: string;
}

export const ServicesContext = createContext<AppServices | null>(null);

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('ServicesContext is missing.');
  return services;
}
