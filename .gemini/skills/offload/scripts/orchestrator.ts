import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
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
  
  // We MUST ensure this entire block is interpreted as a SINGLE string passed to the container's shell
  const remoteTmuxCmd = `tmux attach-session -t ${sessionName} 2>/dev/null || tmux new-session -s ${sessionName} -n 'offload' 'cd /home/node/dev/worktrees/${sessionName} && ${remoteWorker}; exec $SHELL'`;
  const containerWrap = `sudo docker exec -it maintainer-worker sh -c ${q(remoteTmuxCmd)}`;
  
  const finalSSH = provider.getRunCommand(containerWrap, { interactive: true });

  const isWithinGemini = !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;
  const terminalTarget = config.terminalTarget || 'tab';

  if (isWithinGemini && env.TERM_PROGRAM === 'iTerm.app') {
    const tempCmdPath = path.join(process.env.TMPDIR || '/tmp', `offload-ssh-${prNumber}.sh`);
    fs.writeFileSync(tempCmdPath, `#!/bin/bash\n${finalSSH}\nrm "$0"`, { mode: 0o755 });

    const appleScript = terminalTarget === 'window' ? `
      on run argv
        tell application "iTerm"
          set newWindow to (create window with default profile)
          tell current session of newWindow
            write text (item 1 of argv) & return
          end tell
          activate
        end tell
      end run
    ` : `
      on run argv
        tell application "iTerm"
          tell current window
            set newTab to (create tab with default profile)
            tell current session of newTab
              write text (item 1 of argv) & return
            end tell
          end tell
          activate
        end tell
      end run
    `;
    
    spawnSync('osascript', ['-', tempCmdPath], { input: appleScript });
    console.log(`✅ iTerm2 ${terminalTarget} opened for job #${prNumber}.`);
    return 0;
  }

  // Fallback: Run in current terminal
  console.log(`📡 Connecting to session ${sessionName}...`);
  spawnSync(finalSSH, { stdio: 'inherit', shell: true });

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestrator(process.argv.slice(2)).catch(console.error);
}
