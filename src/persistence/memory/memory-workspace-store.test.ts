import { describeWorkspaceStoreContract } from '../workspace-store.contract';
import { MemoryWorkspaceStore } from './memory-workspace-store';

describeWorkspaceStoreContract('memory', () => new MemoryWorkspaceStore());
