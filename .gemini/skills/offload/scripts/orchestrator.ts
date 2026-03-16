/**
 * Universal Offload Orchestrator (Local)
 * 
 * Automatically connects to your dedicated worker and launches a persistent tmux task.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ProviderFactory } from './providers/ProviderFactory.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const q = (str: string) => `'${str.replace(/'/g, "'\\''")}'`;

export async function runOrchestrator(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const prNumber = args[0];
  const action = args[1] || 'review';
  
  if (!prNumber) {
    console.error('Usage: npm run offload <PR_NUMBER> [action]');
    return 1;
  }

  // 1. Load Settings
  const settingsPath = path.join(REPO_ROOT, '.gemini/settings.json');
  if (!fs.existsSync(settingsPath)) {
    console.error('❌ Settings not found. Run "npm run offload:setup" first.');
    return 1;
  }
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.maintainer?.deepReview;
  if (!config) {
    console.error('❌ Deep Review configuration not found.');
    return 1;
  }

  const { projectId, zone, remoteWorkDir } = config;
  const targetVM = `gcli-offload-${env.USER || 'mattkorwel'}`;
  
  const provider = ProviderFactory.getProvider({ projectId, zone, instanceName: targetVM });

  // 2. Wake Worker
  await provider.ensureReady();

  const remotePolicyPath = `~/.gemini/policies/offload-policy.toml`;
  const persistentScripts = `~/.offload/scripts`;
  const sessionName = `offload-${prNumber}-${action}`;
  const remoteWorktreeDir = `~/dev/worktrees/${sessionName}`;

  // 3. Remote Context Setup (Parallel Worktree)
  console.log(`🚀 Provisioning persistent worktree for ${action} on #${prNumber}...`);
  
  let setupCmd = '';
  if (action === 'implement') {
      const branchName = `impl-${prNumber}`;
      setupCmd = `
        mkdir -p ~/dev/worktrees && \
        cd ${remoteWorkDir} && \
        git fetch upstream main && \
        git worktree add -f -b ${branchName} ${remoteWorktreeDir} upstream/main
      `;
  } else {
      setupCmd = `
        mkdir -p ~/dev/worktrees && \
        cd ${remoteWorkDir} && \
        git fetch upstream pull/${prNumber}/head && \
        git worktree add -f ${remoteWorktreeDir} FETCH_HEAD
      `;
  }

  await provider.exec(setupCmd, { wrapContainer: 'maintainer-worker' });

  // 4. Execution Logic (Persistent Workstation Mode)
  const remoteWorker = `tsx ${persistentScripts}/entrypoint.ts ${prNumber} remote-branch ${remotePolicyPath} ${action}`;
  
  // We launch a tmux session inside the container
  const tmuxCmd = `docker exec -it -w /home/node/dev/worktrees/${sessionName} maintainer-worker sh -c ${q(`${remoteWorker}; exec $SHELL`)}`;
  const tmuxAttach = `tmux attach-session -t ${sessionName} 2>/dev/null || tmux new-session -s ${sessionName} -n 'offload' ${q(tmuxCmd)}`;
  
  // High-performance primary SSH with IAP fallback via Provider.exec
  // Note: We use provider.exec for consistency and robustness
  await provider.exec(tmuxAttach, { interactive: true });

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestrator(process.argv.slice(2)).catch(console.error);
}
