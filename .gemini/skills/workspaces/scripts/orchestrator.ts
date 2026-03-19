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

  const { projectId, zone } = config;
  const targetVM = `gcli-workspace-${env.USER || 'mattkorwel'}`;
  const provider = ProviderFactory.getProvider({ projectId, zone, instanceName: targetVM });

  // 2. Wake Worker & Verify Container
  await provider.ensureReady();

  // Paths
  const hostWorkspaceRoot = `/mnt/disks/data`;
  const hostWorkDir = `${hostWorkspaceRoot}/main`;
  const containerHome = '/home/node';
  const containerWorkspaceRoot = `/home/node/.workspaces`;
  
  const remotePolicyPath = `${containerWorkspaceRoot}/policies/workspace-policy.toml`;
  const persistentScripts = `${containerWorkspaceRoot}/scripts`;
  const sessionName = `workspace-${prNumber}-${action}`;
  const remoteWorktreeDir = `${containerWorkspaceRoot}/worktrees/${sessionName}`;
  const hostWorktreeDir = `${hostWorkspaceRoot}/worktrees/${sessionName}`;

  // 3. Remote Context Setup (Executed on HOST for permission simplicity)
  console.log(`🚀 Preparing remote environment for ${action} on #${prNumber}...`);
  
  // FIX: Use the host path to check for existence
  const check = await provider.getExecOutput(`ls -d ${hostWorktreeDir}/.git`);
  
  // FIX: Ensure container user (node) owns the workspaces directories
  // This resolves EACCES errors across all shared volumes.
  console.log('   - Synchronizing container permissions...');
  await provider.exec(`sudo chown -R 1000:1000 /mnt/disks/data`);

  if (check.status !== 0) {
    console.log('   - Provisioning isolated git worktree...');
    
    // We run these on the host because the host user owns the data directory
    const setupCmd = `
      sudo -u chronos git -C ${hostWorkDir} config --add safe.directory ${hostWorkDir} && \
      sudo mkdir -p ${hostWorkspaceRoot}/worktrees && \
      sudo chown chronos:chronos ${hostWorkspaceRoot}/worktrees && \
      sudo -u chronos git -C ${hostWorkDir} fetch --quiet upstream pull/${prNumber}/head && \
      sudo -u chronos git -C ${hostWorkDir} worktree add --quiet -f ${hostWorktreeDir} FETCH_HEAD 2>&1
    `;
    const setupRes = await provider.getExecOutput(setupCmd);
    if (setupRes.status !== 0) {
        console.error('   ❌ Failed to provision remote worktree.');
        console.error('   STDOUT:', setupRes.stdout);
        console.error('   STDERR:', setupRes.stderr);
        return 1;
    }
    console.log('   ✅ Worktree provisioned successfully.');
  } else {
    console.log('   ✅ Remote worktree ready.');
  }

  // 4. Execution Logic
  const remoteWorker = `tsx ${persistentScripts}/entrypoint.ts ${prNumber} . ${remotePolicyPath} ${action}`;
  const remoteConfigPath = `${hostWorkspaceRoot}/gemini-cli-config/.gemini/settings.json`;
  
  // FIX: Dynamically retrieve the API key from the host-side config to inject it
  const apiKeyRes = await provider.getExecOutput(`cat ${remoteConfigPath} | grep apiKey | cut -d '\"' -f 4`);
  const remoteApiKey = apiKeyRes.stdout.trim();

  // DEBUG: Run directly in foreground WITHOUT tmux to see immediate errors
  const containerWrap = `sudo docker exec -it ${remoteApiKey ? `-e GEMINI_API_KEY=${remoteApiKey}` : ''} maintainer-worker sh -c ${q(`cd ${remoteWorktreeDir} && ${remoteWorker}; exec $SHELL`)}`;
  
  const finalSSH = provider.getRunCommand(containerWrap, { interactive: true });

  const isWithinGemini = !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;
  const terminalTarget = config.terminalTarget || 'tab';
  const forceMainTerminal = true; // Stay in current terminal for E2E verification

  if (!forceMainTerminal && isWithinGemini && env.TERM_PROGRAM === 'iTerm.app') {
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

  // Fallback: Run in current terminal
  console.log(`📡 Connecting to session ${sessionName}...`);
  spawnSync(finalSSH, { stdio: 'inherit', shell: true });

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestrator(process.argv.slice(2)).catch(console.error);
}
