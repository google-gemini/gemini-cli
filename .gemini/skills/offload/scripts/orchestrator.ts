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

  const { projectId, zone } = config;
  const targetVM = `gcli-offload-${env.USER || 'mattkorwel'}`;
  const provider = ProviderFactory.getProvider({ projectId, zone, instanceName: targetVM });

  // 2. Wake Worker & Verify Container
  await provider.ensureReady();

  // Use Absolute Container Paths
  const containerHome = '/home/node';
  const remoteWorkDir = `${containerHome}/dev/main`;
  const remotePolicyPath = `${containerHome}/.gemini/policies/offload-policy.toml`;
  const persistentScripts = `${containerHome}/.offload/scripts`;
  const sessionName = `offload-${prNumber}-${action}`;
  const remoteWorktreeDir = `${containerHome}/dev/worktrees/${sessionName}`;

  // 3. Remote Context Setup
  console.log(`🚀 Preparing remote environment for ${action} on #${prNumber}...`);
  
  // Check if worktree exists
  const check = await provider.getExecOutput(`ls -d ${remoteWorktreeDir}/.git`, { wrapContainer: 'maintainer-worker' });
  
  if (check.status !== 0) {
    console.log('   - Provisioning isolated git worktree...');
    // Fix permissions first
    await provider.exec(`sudo docker exec -u root maintainer-worker chown -R node:node ${containerHome}/dev`);
    
    const setupCmd = `
      git config --global --add safe.directory ${remoteWorkDir} && \
      mkdir -p ${containerHome}/dev/worktrees && \
      cd ${remoteWorkDir} && \
      git fetch upstream pull/${prNumber}/head && \
      git worktree add -f ${remoteWorktreeDir} FETCH_HEAD
    `;
    await provider.exec(setupCmd, { wrapContainer: 'maintainer-worker' });
  } else {
    console.log('   ✅ Remote worktree ready.');
  }

  // 4. Execution Logic
  const remoteWorker = `tsx ${persistentScripts}/entrypoint.ts ${prNumber} . ${remotePolicyPath} ${action}`;
  const remoteTmuxCmd = `tmux attach-session -t ${sessionName} 2>/dev/null || tmux new-session -s ${sessionName} -n 'offload' 'cd ${remoteWorktreeDir} && ${remoteWorker}; exec $SHELL'`;
  const containerWrap = `sudo docker exec -it maintainer-worker sh -c ${q(remoteTmuxCmd)}`;
  
  const finalSSH = provider.getRunCommand(containerWrap, { interactive: true });

  const isWithinGemini = !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;
  const forceMainTerminal = true; // For debugging

  if (!forceMainTerminal && isWithinGemini && env.TERM_PROGRAM === 'iTerm.app') {
    const tempCmdPath = path.join(process.env.TMPDIR || '/tmp', `offload-ssh-${prNumber}.sh`);
    fs.writeFileSync(tempCmdPath, `#!/bin/bash\n${finalSSH}\nrm "$0"`, { mode: 0o755 });
    const appleScript = `on run argv\ntell application "iTerm"\ntell current window\nset newTab to (create tab with default profile)\ntell current session of newTab\nwrite text (item 1 of argv) & return\nend tell\nend tell\nactivate\nend tell\nend run`;
    spawnSync('osascript', ['-', tempCmdPath], { input: appleScript });
    console.log(`✅ iTerm2 tab opened.`);
    return 0;
  }

  console.log(`📡 Connecting to session ${sessionName}...`);
  spawnSync(finalSSH, { stdio: 'inherit', shell: true });

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestrator(process.argv.slice(2)).catch(console.error);
}
