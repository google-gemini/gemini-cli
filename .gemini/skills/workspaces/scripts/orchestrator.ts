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
    console.error('Usage: npm run workspace <PR_NUMBER> [action]');
    return 1;
  }

  // 1. Load Settings
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

  const { projectId, zone, remoteWorkDir } = config;
  const targetVM = `gcli-workspace-${env.USER || 'mattkorwel'}`;
  const provider = ProviderFactory.getProvider({ projectId, zone, instanceName: targetVM });

  // 2. Wake Worker & Verify Container
  await provider.ensureReady();

  // Use Absolute Container Paths
  const containerHome = '/home/node';
  const remotePolicyPath = `${containerHome}/.gemini/policies/workspace-policy.toml`;
  const persistentScripts = `${containerHome}/.workspaces/scripts`;
  const sessionName = `workspace-${prNumber}-${action}`;
  const remoteWorktreeDir = `${containerHome}/dev/worktrees/${sessionName}`;

  // 3. Remote Context Setup
  console.log(`🚀 Preparing remote environment for ${action} on #${prNumber}...`);
  
  const check = await provider.getExecOutput(`ls -d ${remoteWorktreeDir}/.git`, { wrapContainer: 'maintainer-worker' });
  
  if (check.status !== 0) {
    console.log('   - Provisioning isolated git worktree...');
    await provider.exec(`sudo docker exec -u root maintainer-worker mkdir -p ${containerHome}/dev/worktrees && sudo docker exec -u root maintainer-worker chown -R node:node ${containerHome}/dev/worktrees`);
    
    const setupCmd = `
      git config --global --add safe.directory ${containerHome}/dev/main && \
      mkdir -p ${containerHome}/dev/worktrees && \
      cd ${containerHome}/dev/main && \
      git fetch upstream pull/${prNumber}/head && \
      git worktree add -f ${remoteWorktreeDir} FETCH_HEAD
    `;
    await provider.exec(setupCmd, { wrapContainer: 'maintainer-worker' });
  } else {
    console.log('   ✅ Remote worktree ready.');
  }

  // 4. Execution Logic
  const remoteWorker = `tsx ${persistentScripts}/entrypoint.ts ${prNumber} . ${remotePolicyPath} ${action}`;
  
  // tmux command inside container
  const remoteTmuxCmd = `tmux attach-session -t ${sessionName} 2>/dev/null || tmux new-session -s ${sessionName} -n 'workspace' 'cd ${remoteWorktreeDir} && ${remoteWorker}; exec $SHELL'`;
  
  const terminalTarget = config.terminalTarget || 'tab';
  const isWithinGemini = !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;

  // Handle different UI targets
  switch (terminalTarget) {
    case 'background':
        console.log(`📡 Job #${prNumber} starting in background (session: ${sessionName}).`);
        // Remove -it for background launch
        const bgWrap = `sudo docker exec maintainer-worker sh -c ${q(remoteTmuxCmd)}`;
        await provider.exec(bgWrap);
        console.log(`✅ Job is running. Attach anytime with: npm run workspace:attach ${prNumber} ${action}`);
        return 0;

    case 'tab':
    case 'window':
        if (isWithinGemini && env.TERM_PROGRAM === 'iTerm.app') {
            const containerWrap = `sudo docker exec -it maintainer-worker sh -c ${q(remoteTmuxCmd)}`;
            const finalSSH = provider.getRunCommand(containerWrap, { interactive: true });
            const tempCmdPath = path.join(process.env.TMPDIR || '/tmp', `workspace-ssh-${prNumber}.sh`);
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
        // Fallthrough to foreground if not in iTerm
        console.log('   ⚠️ iTerm2 not detected or not in Gemini. Falling back to foreground...');

    case 'foreground':
    default:
        console.log(`📡 Connecting to session ${sessionName}...`);
        const fgWrap = `sudo docker exec -it maintainer-worker sh -c ${q(remoteTmuxCmd)}`;
        const fgSSH = provider.getRunCommand(fgWrap, { interactive: true });
        spawnSync(fgSSH, { stdio: 'inherit', shell: true });
        return 0;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestrator(process.argv.slice(2)).catch(console.error);
}
