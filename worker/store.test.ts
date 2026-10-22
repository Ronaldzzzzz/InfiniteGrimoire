import { describeStoreContract } from './store-contract';
import { MemoryStore } from './store';

describeStoreContract('MemoryStore', async () => new MemoryStore());
