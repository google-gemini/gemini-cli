/**
 * Universal Offload Orchestrator (Local)
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
  const action = args[1] || 'review'; // Default action is review
  
  if (!prNumber) {
    console.error('Usage: npm run offload <PR_NUMBER> [action]');
    return 1;
  }

  // Load Settings
  const settingsPath = path.join(REPO_ROOT, '.gemini/settings.json');
  let settings: any = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
  }

  let config = settings.maintainer?.deepReview;
  if (!config) {
    console.log('⚠️  Offload configuration not found. Launching setup...');
    const setupResult = spawnSync('npm', ['run', 'offload:setup'], { stdio: 'inherit' });
    if (setupResult.status !== 0) {
      console.error('❌ Setup failed. Please run "npm run offload:setup" manually.');
      return 1;
    }
    // Reload settings after setup
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    config = settings.maintainer.deepReview;
  }

  const { remoteHost, remoteWorkDir, terminalType, syncAuth, geminiSetup, ghSetup } = config;

  console.log(`🔍 Fetching metadata for PR #${prNumber}...`);
  const ghView = spawnSync('gh', ['pr', 'view', prNumber, '--json', 'headRefName', '-q', '.headRefName'], { shell: true });
  const branchName = ghView.stdout.toString().trim();
  if (!branchName) {
    console.error('❌ Failed to resolve PR branch.');
    return 1;
  }

  const sessionName = `${prNumber}-${branchName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  // 2. Sync Configuration Mirror (Isolated Profiles)
  const ISOLATED_GEMINI = geminiSetup === 'isolated' ? '~/.gemini-deep-review' : '~/.gemini';
  const ISOLATED_GH = ghSetup === 'isolated' ? '~/.gh-deep-review' : '~/.config/gh';
  const remotePolicyPath = `${ISOLATED_GEMINI}/policies/deep-review-policy.toml`;
  
  console.log(`📡 Mirroring environment to ${remoteHost}...`);
  spawnSync('ssh', [remoteHost, `mkdir -p ${remoteWorkDir}/.gemini/skills/offload/scripts/ ${ISOLATED_GEMINI}/policies/`]);
  
  // Sync the policy file specifically
  spawnSync('rsync', ['-avz', path.join(REPO_ROOT, '.gemini/skills/offload/policy.toml'), `${remoteHost}:${remotePolicyPath}`]);

  spawnSync('rsync', ['-avz', '--delete', path.join(REPO_ROOT, '.gemini/skills/offload/scripts/'), `${remoteHost}:${remoteWorkDir}/.gemini/skills/offload/scripts/`]);

  if (syncAuth) {
    const homeDir = env.HOME || '';
    const localGeminiDir = path.join(homeDir, '.gemini');
    const syncFiles = ['google_accounts.json', 'settings.json'];
    for (const f of syncFiles) {
      const lp = path.join(localGeminiDir, f);
      if (fs.existsSync(lp)) spawnSync('rsync', ['-avz', lp, `${remoteHost}:${ISOLATED_GEMINI}/${f}`]);
    }
    const localPolicies = path.join(localGeminiDir, 'policies/');
    if (fs.existsSync(localPolicies)) spawnSync('rsync', ['-avz', '--delete', localPolicies, `${remoteHost}:${ISOLATED_GEMINI}/policies/`]);
    const localEnv = path.join(REPO_ROOT, '.env');
    if (fs.existsSync(localEnv)) spawnSync('rsync', ['-avz', localEnv, `${remoteHost}:${remoteWorkDir}/.env`]);
  }

  // 3. Construct Clean Command
  const envLoader = 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"';
  // Set FORCE_LOCAL_OPEN=1 to signal the worker to use OSC 1337 for links
  const remoteWorker = `export FORCE_LOCAL_OPEN=1 && export GEMINI_CLI_HOME=${ISOLATED_GEMINI} && export GH_CONFIG_DIR=${ISOLATED_GH} && ./node_modules/.bin/tsx .gemini/skills/offload/scripts/entrypoint.ts ${prNumber} ${branchName} ${remotePolicyPath} ${action}`;
  
  const tmuxCmd = `cd ${remoteWorkDir} && ${envLoader} && ${remoteWorker}; exec $SHELL`;
  const sshInternal = `tmux attach-session -t ${sessionName} 2>/dev/null || tmux new-session -s ${sessionName} -n ${q(branchName)} ${q(tmuxCmd)}`;
  const sshCmd = `ssh -t ${remoteHost} ${q(sshInternal)}`;

  // 4. Smart Context Execution
  const isWithinGemini = !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;
  const forceBackground = args.includes('--background');

  if (isWithinGemini || forceBackground) {
    if (process.platform === 'darwin' && terminalType !== 'none' && !forceBackground) {
      // macOS: Use Window Automation
      let appleScript = `on run argv\n set theCommand to item 1 of argv\n tell application "iTerm"\n set newWindow to (create window with default profile)\n tell current session of newWindow\n write text theCommand\n end tell\n activate\n end tell\n end run`;
      if (terminalType === 'terminal') {
        appleScript = `on run argv\n set theCommand to item 1 of argv\n tell application "Terminal"\n do script theCommand\n activate\n end tell\n end run`;
      }

      spawnSync('osascript', ['-', sshCmd], { input: appleScript });
      console.log(`✅ ${terminalType.toUpperCase()} window opened for verification.`);
      return 0;
    }

    // Cross-Platform Background Mode
    console.log(`📡 Launching remote verification in background mode...`);
    const logFile = path.join(REPO_ROOT, `.gemini/logs/offload-${prNumber}/background.log`);
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    
    const backgroundCmd = `ssh ${remoteHost} ${q(tmuxCmd)} > ${q(logFile)} 2>&1 &`;
    spawnSync(backgroundCmd, { shell: true });
    
    console.log(`⏳ Remote worker started in background.`);
    console.log(`📄 Tailing logs to: .gemini/logs/offload-${prNumber}/background.log`);
    return 0;
  }

  // Direct Shell Mode: Execute SSH in-place
  console.log(`🚀 Launching offload session in current terminal...`);
  const result = spawnSync(sshCmd, { stdio: 'inherit', shell: true });
  return result.status || 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestrator(process.argv.slice(2)).catch(console.error);
}
