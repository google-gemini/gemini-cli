/**
 * Universal Workspace Cleanup (Local)
 * 
 * Surgical or full cleanup of sessions and worktrees on the GCE worker.
 * Refactored to use WorkerProvider for container compatibility.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { ProviderFactory } from './providers/ProviderFactory.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function runCleanup(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const prNumber = args[0];
  const action = args[1];

  const settingsPath = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');
  if (!fs.existsSync(settingsPath)) {
    console.error('❌ Settings not found. Run "npm run workspace:setup" first.');
    return 1;
  }

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.workspace;
  if (!config) {
    console.error('❌ Workspace configuration not found.');
    return 1;
  }

  const { projectId, zone } = config;
  const targetVM = `gcli-workspace-${env.USER || 'mattkorwel'}`;
  const provider = ProviderFactory.getProvider({ projectId, zone, instanceName: targetVM });

  if (prNumber && action) {
    const sessionName = `workspace-${prNumber}-${action}`;
    const worktreePath = `/home/node/dev/worktrees/${sessionName}`;
    
    console.log(`🧹 Surgically removing session and worktree for ${prNumber}-${action}...`);
    
    // Kill specific tmux session inside container
    await provider.exec(`tmux kill-session -t ${sessionName} 2>/dev/null`, { wrapContainer: 'maintainer-worker' });
    
    // Remove specific worktree inside container
    await provider.exec(`cd /home/node/dev/main && git worktree remove -f ${worktreePath} 2>/dev/null && git worktree prune`, { wrapContainer: 'maintainer-worker' });
    
    console.log(`✅ Cleaned up ${prNumber}-${action}.`);
    return 0;
  }

  // --- Bulk Cleanup ---
  console.log(`🧹 Starting BULK cleanup on ${targetVM}...`);

  // 1. Standard Cleanup
  console.log('   - Killing ALL remote tmux sessions...');
  await provider.exec(`tmux kill-server`, { wrapContainer: 'maintainer-worker' });

  console.log('   - Cleaning up ALL Git Worktrees...');
  await provider.exec(`cd /home/node/dev/main && git worktree prune && rm -rf /home/node/dev/worktrees/*`, { wrapContainer: 'maintainer-worker' });

  console.log('✅ Remote environment cleared.');

  // 2. Full Wipe Option
  const shouldWipe = await confirm('\nWould you like to COMPLETELY wipe the remote workspace (main clone)?');
  
  if (shouldWipe) {
    console.log(`🔥 Wiping /home/node/dev/main...`);
    await provider.exec(`rm -rf /home/node/dev/main && mkdir -p /home/node/dev/main`, { wrapContainer: 'maintainer-worker' });
    console.log('✅ Remote hub wiped. You will need to run npm run workspace:setup again.');
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCleanup(process.argv.slice(2)).catch(console.error);
}
