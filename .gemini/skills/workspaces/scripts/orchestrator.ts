/**
 * Workspace Orchestrator (Local)
 * 
 * Central coordination of remote tasks.
 * Wakes workers, prepares worktrees, and launches tmux sessions.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ProviderFactory } from './providers/ProviderFactory.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

function q(str: string) {
    return `'${str.replace(/'/g, "'\\''")}'`;
}

export async function runOrchestrator(args: string[], env: NodeJS.ProcessEnv = process.env) {
  let prNumber = args[0];
  let action = args[1] || 'review';

  // Handle "shell" mode: npm run workspace:shell [identifier]
  const isShellMode = prNumber === 'shell';
  if (isShellMode) {
      prNumber = args[1] || `adhoc-${Math.floor(Math.random() * 10000)}`;
      action = 'shell';
  }

  if (!prNumber) {
    console.error('❌ Usage: npm run workspace <PR_NUMBER> [action] OR npm run workspace:shell [identifier]');
    return 1;
  }

  // 1. Load Settings
  const settingsPath = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');
  if (!fs.existsSync(settingsPath)) {
    console.error('❌ Workspace settings not found. Run "npm run workspace:setup" first.');
    return 1;
  }
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.workspace;

  const targetVM = `gcli-workspace-${env.USER || 'mattkorwel'}`;
  const provider = ProviderFactory.getProvider({ projectId: config.projectId, zone: config.zone, instanceName: targetVM });

  // 2. Wake Worker & Verify Container
  await provider.ensureReady();

  // Retrieve the remote user to ensure we run git commands correctly
  const whoamiRes = await provider.getExecOutput('whoami');
  const remoteUser = whoamiRes.stdout.trim();

  // Paths - Unified across host and container
  const hostWorkspaceRoot = `/home/node/.workspaces`;
  const hostWorkDir = `${hostWorkspaceRoot}/main`;
  const containerHome = '/home/node';
  const containerWorkspaceRoot = `/home/node/.workspaces`;
  
  const remotePolicyPath = `${containerWorkspaceRoot}/policies/workspace-policy.toml`;
  const persistentScripts = `${containerWorkspaceRoot}/scripts`;
  const sessionName = `workspace-${prNumber}-${action}`;
  const remoteWorktreeDir = `${containerWorkspaceRoot}/worktrees/${sessionName}`;
  const hostWorktreeDir = `${hostWorkspaceRoot}/worktrees/${sessionName}`;

  // 3. Remote Context Setup (Executed on HOST for permission simplicity)
  console.log(`🚀 Preparing remote environment for ${action} on ${isShellMode ? 'branch/id' : '#'}${prNumber}...`);
  
  // FIX: Use the host path to check for existence
  const check = await provider.getExecOutput(`ls -d ${hostWorktreeDir}/.git`);
  
  // FIX: Ensure container user (node) owns the workspaces directories
  console.log('   - Synchronizing container permissions...');
  await provider.exec(`sudo chown -R 1000:1000 /home/node/.workspaces`);

  if (check.status !== 0) {
    console.log(`   - Provisioning isolated git worktree for ${prNumber}...`);
    
    // We run these on the host. We use the current remote user to ensure ownership is correct.
    const gitFetch = isShellMode 
        ? `git -C ${hostWorkDir} fetch --quiet origin`
        : `git -C ${hostWorkDir} fetch --quiet upstream pull/${prNumber}/head`;
    
    const gitTarget = isShellMode ? 'FETCH_HEAD' : 'FETCH_HEAD'; 

    const setupCmd = `
      git -C ${hostWorkDir} config --add safe.directory ${hostWorkDir} && \
      mkdir -p ${hostWorkspaceRoot}/worktrees && \
      ${gitFetch} && \
      git -C ${hostWorkDir} worktree add --quiet -f ${hostWorktreeDir} ${gitTarget} 2>&1
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

  // AUTH: Dynamically retrieve credentials from host-side config/disk
  const remoteConfigPath = `${hostWorkspaceRoot}/gemini-cli-config/.gemini/settings.json`;
  const remoteSettingsRes = await provider.getExecOutput(`cat ${remoteConfigPath}`);
  const remoteSettingsJson = remoteSettingsRes.stdout.trim();
  
  const apiKeyRes = await provider.getExecOutput(`cat ${remoteConfigPath} | grep apiKey | cut -d '\"' -f 4`);
  const remoteApiKey = apiKeyRes.stdout.trim();
  
  const ghTokenRes = await provider.getExecOutput(`cat ${hostWorkspaceRoot}/.gh_token`);
  const remoteGhToken = ghTokenRes.stdout.trim();

  // AUTH: Inject credentials and settings directly into the worktree
  console.log('   - Injecting remote authentication and UI context...');
  const dotEnvContent = `
GEMINI_API_KEY=${remoteApiKey}
COLORTERM=truecolor
TERM=xterm-256color
GEMINI_AUTO_UPDATE=0
GEMINI_SANDBOX=workspace
GEMINI_HOST=${targetVM}
`.trim();
  await provider.exec(`sudo docker exec maintainer-worker sh -c ${q(`echo ${q(dotEnvContent)} > ${remoteWorktreeDir}/.env`)}`);
  
  // Also inject the settings.json into the worktree's .gemini folder for maximum reliability
  await provider.exec(`sudo docker exec maintainer-worker sh -c ${q(`mkdir -p ${remoteWorktreeDir}/.gemini && echo ${q(remoteSettingsJson)} > ${remoteWorktreeDir}/.gemini/settings.json`)}`);

  // 4. Execution Logic
  // In shell mode, we just start gemini. In action mode, we run the entrypoint.
  const remoteWorker = isShellMode 
    ? `gemini`
    : `tsx ${persistentScripts}/entrypoint.ts ${prNumber} . ${remotePolicyPath} ${action}`;

  const authEnv = `-e GEMINI_AUTO_UPDATE=0 ${remoteApiKey ? `-e GEMINI_API_KEY=${remoteApiKey} ` : ''}${remoteGhToken ? `-e GITHUB_TOKEN=${remoteGhToken} -e GH_TOKEN=${remoteGhToken} ` : ''}`;
  
  // PERSISTENCE: Wrap the entire execution in a tmux session inside the container
  // We HIDE the tmux status bar to reduce visual noise
  const tmuxStyle = `
    tmux set -g status off;
  `.replace(/\n/g, '');

  const tmuxCmd = `tmux new-session -A -s ${sessionName} ${q(`${tmuxStyle} cd ${remoteWorktreeDir} && ${remoteWorker}; exec $SHELL`)}`;
  const containerWrap = `sudo docker exec -it -e COLORTERM=truecolor -e TERM=xterm-256color ${authEnv}maintainer-worker sh -c ${q(tmuxCmd)}`;
  
  const finalSSH = provider.getRunCommand(containerWrap, { interactive: true });

  const isWithinGemini = !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;
  
  // 1.5 Handle --open override
  const openIdx = args.indexOf('--open');
  let terminalTarget = config.terminalTarget || 'tab';
  if (openIdx !== -1 && args[openIdx + 1]) {
      terminalTarget = args[openIdx + 1];
  }

  const forceMainTerminal = terminalTarget === 'foreground';

  if (!forceMainTerminal && isWithinGemini && env.TERM_PROGRAM === 'iTerm.app') {
    const tempCmdPath = path.join(process.env.TMPDIR || '/tmp', `workspace-ssh-${prNumber}.sh`);
    fs.writeFileSync(tempCmdPath, `#!/bin/bash\n${finalSSH}\nrm "$0"`, { mode: 0o755 });

    const appleScript = terminalTarget === 'window' ? `
                on run argv
                tell application "iTerm"
                    set newWindow to (create window with default profile)
                    tell current session of newWindow
                    write text (quoted form of item 1 of argv) & return
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
                        write text (quoted form of item 1 of argv) & return
                    end tell
                    end tell
                    activate
                end tell
                end run
            `;
    spawnSync('osascript', ['-', tempCmdPath], { input: appleScript });
    console.log(`✅ iTerm2 ${terminalTarget} opened for job ${prNumber}.`);
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
