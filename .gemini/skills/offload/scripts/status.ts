/**
 * Offload Status Inspector (Local)
 * 
 * Orchestrates remote status retrieval via the WorkerProvider.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ProviderFactory } from './providers/ProviderFactory.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

async function runStatus(env: NodeJS.ProcessEnv = process.env) {
  const settingsPath = path.join(REPO_ROOT, '.gemini/offload/settings.json');
  if (!fs.existsSync(settingsPath)) {
    console.error('❌ Settings not found. Run "npm run offload:setup" first.');
    return 1;
  }
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.deepReview;
  if (!config) {
    console.error('❌ Deep Review configuration not found.');
    return 1;
  }

  const { projectId, zone } = config;
  const targetVM = `gcli-offload-${env.USER || 'mattkorwel'}`;
  const provider = ProviderFactory.getProvider({ projectId, zone, instanceName: targetVM });

  console.log(`\n🛰️  Offload Mission Control: ${targetVM}`);
  console.log(`--------------------------------------------------------------------------------`);
  
  const status = await provider.getStatus();
  console.log(`   - VM State:   ${status.status}`);
  console.log(`   - Internal IP: ${status.internalIp || 'N/A'}`);

  if (status.status === 'RUNNING') {
    console.log(`\n🧵 Active Sessions (tmux):`);
    // We fetch the list of sessions from the host
    const tmuxRes = await provider.getExecOutput('tmux list-sessions -F "#S" 2>/dev/null');
    
    if (tmuxRes.status === 0 && tmuxRes.stdout.trim()) {
      const sessions = tmuxRes.stdout.trim().split('\n');
      sessions.forEach(s => {
        if (s.startsWith('offload-')) {
          console.log(`     ✅ ${s}`);
        } else {
          console.log(`     🔹 ${s} (Non-offload)`);
        }
      });
    } else {
      console.log('     - No active sessions');
    }
  }

  console.log(`--------------------------------------------------------------------------------\n`);
  return 0;
}

runStatus().catch(console.error);
