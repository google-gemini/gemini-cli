/**
 * Universal Offload Orchestrator (Local)
 * 
 * Automatically connects to your dedicated worker and launches the task.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.maintainer?.deepReview;
  if (!config) {
    console.error('❌ Settings not found. Run "npm run offload:setup" first.');
    return 1;
  }

  const { projectId, zone, remoteHost, remoteHome, remoteWorkDir, useContainer } = config;
  const targetVM = `gcli-offload-${env.USER || 'mattkorwel'}`;

  // 2. Wake Worker
  const statusCheck = spawnSync(`gcloud compute instances describe ${targetVM} --project ${projectId} --zone ${zone} --format="get(status)"`, { shell: true });
  const status = statusCheck.stdout.toString().trim();

  if (status !== 'RUNNING' && status !== 'PROVISIONING' && status !== 'STAGING') {
    console.log(`⚠️ Worker ${targetVM} is ${status}. Waking it up...`);
    spawnSync(`gcloud compute instances start ${targetVM} --project ${projectId} --zone ${zone}`, { shell: true, stdio: 'inherit' });
  }

  const remotePolicyPath = `${remoteHome}/.gemini/policies/offload-policy.toml`;
  const persistentScripts = `${remoteHome}/.offload/scripts`;
  const sessionName = `offload-${prNumber}-${action}`;

  // 3. Remote Context Setup (Parallel Worktree)
  console.log(`🚀 Provisioning clean worktree for ${action} on PR #${prNumber}...`);
  const remoteWorktreeDir = `${remoteHome}/dev/worktrees/offload-${prNumber}-${action}`;
  
  const setupCmd = `
    mkdir -p ${remoteHome}/dev/worktrees && \
    cd ${remoteWorkDir} && \
    git fetch upstream pull/${prNumber}/head && \
    git worktree add -f ${remoteWorktreeDir} FETCH_HEAD
  `;

  // Wrap in docker exec if needed
  const finalSetupCmd = useContainer 
    ? `docker exec gemini-sandbox sh -c ${q(setupCmd)}`
    : setupCmd;

  spawnSync(`ssh ${remoteHost} ${q(finalSetupCmd)}`, { shell: true, stdio: 'inherit' });

  // 4. Execution Logic
  const remoteWorker = `tsx ${persistentScripts}/entrypoint.ts ${prNumber} remote-branch ${remotePolicyPath} ${action}`;
  
  let tmuxCmd = `cd ${remoteWorktreeDir} && ${remoteWorker}; exec $SHELL`;
  if (useContainer) {
    // Inside container, we need to ensure the environment is loaded
    tmuxCmd = `docker exec -it -w ${remoteWorktreeDir} gemini-sandbox sh -c "${remoteWorker}; exec $SHELL"`;
  } else {
    tmuxCmd = `cd ${remoteWorktreeDir} && ${tmuxCmd}`;
  }
  
  const sshInternal = `tmux attach-session -t ${sessionName} 2>/dev/null || tmux new-session -s ${sessionName} -n 'offload' ${q(tmuxCmd)}`;
  const finalSSH = `ssh -t ${remoteHost} ${q(sshInternal)}`;

  // 5. Open in iTerm2
  const isWithinGemini = !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;
  if (isWithinGemini) {
    const tempCmdPath = path.join(process.env.TMPDIR || '/tmp', `offload-ssh-${prNumber}.sh`);
    fs.writeFileSync(tempCmdPath, `#!/bin/bash\n${finalSSH}\nrm "$0"`, { mode: 0o755 });

    const appleScript = `
      on run argv
        tell application "iTerm"
          set newWindow to (create window with default profile)
          tell current session of newWindow
            write text (item 1 of argv) & return
          end tell
          activate
        end tell
      end run
    `;
    spawnSync('osascript', ['-', tempCmdPath], { input: appleScript });
    console.log(`✅ iTerm2 window opened on ${remoteHost}.`);
    return 0;
  }

  spawnSync(finalSSH, { stdio: 'inherit', shell: true });
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestrator(process.argv.slice(2)).catch(console.error);
}
