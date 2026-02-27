import { Storage } from './src/config/storage.js';
import { performance } from 'perf_hooks';

async function run() {
  const storage = new Storage(process.cwd());
  await storage.init();
  const start = performance.now();
  const sessions = await storage.listProjectChatFiles();
  const end = performance.now();
  console.log(`Loaded ${sessions.length} sessions in ${(end - start).toFixed(2)} ms`);
}
run().catch(console.error);