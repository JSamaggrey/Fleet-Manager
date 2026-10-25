import { createContext, useContext } from 'react';
import type { AssetService } from '@/application/asset-service';
import type { DepreciationService } from '@/application/depreciation-service';
import type { ExpenseService } from '@/application/expense-service';
import type { RevenueService } from '@/application/revenue-service';
import type { WorkspaceService } from '@/application/workspace-service';
import type { BackupFile, BackupService } from '@/backup/backup-service';

/** Everything the UI may call. Built in src/app (composition root) and injected via context. */
export interface AppServices {
  workspace: WorkspaceService;
  assets: AssetService;
  depreciation: DepreciationService;
  revenue: RevenueService;
  expenses: ExpenseService;
  backup: BackupService;
  /** Hands a generated file to the user (browser download in production). */
  saveFile: (file: BackupFile) => void;
  now: () => Date;
  appVersion: string;
}

export const ServicesContext = createContext<AppServices | null>(null);

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('ServicesContext is missing.');
  return services;
}
