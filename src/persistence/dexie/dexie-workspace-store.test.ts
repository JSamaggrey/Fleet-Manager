import 'fake-indexeddb/auto';
import { describeWorkspaceStoreContract } from '../workspace-store.contract';
import { DexieWorkspaceStore } from './dexie-workspace-store';
import { FmsDatabase } from './fms-database';

let databaseCount = 0;

describeWorkspaceStoreContract('dexie (IndexedDB)', () => {
  databaseCount += 1;
  return new DexieWorkspaceStore(new FmsDatabase(`fms-test-${databaseCount}`));
});
