/**
 * Universal Deep Review Orchestrator (Local)
 */
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const q = (str: string) => `'${str.replace(/'/g, "'\\''")}'`;

async function main() {
  const prNumber = process.argv[2];
  if (!prNumber) {
    console.error('Usage: npm run review <PR_NUMBER>');
    process.exit(1);
  }

  // Load Settings
  const settingsPath = path.join(REPO_ROOT, '.gemini/settings.json');
  let settings: any = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
  }

  let config = settings.maintainer?.deepReview;
  if (!config) {
    console.log('⚠️  Deep Review configuration not found. Launching setup...');
    const setupResult = spawnSync('npm', ['run', 'review:setup'], { stdio: 'inherit' });
    if (setupResult.status !== 0) {
      console.error('❌ Setup failed. Please run "npm run review:setup" manually.');
      process.exit(1);
    }
    // Reload settings after setup
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    config = settings.maintainer.deepReview;
  }

  const { remoteHost, remoteWorkDir, terminalType, syncAuth } = config;

  console.log(`🔍 Fetching metadata for PR #${prNumber}...`);
  const ghView = spawnSync('gh', ['pr', 'view', prNumber, '--json', 'headRefName', '-q', '.headRefName'], { shell: true });
  const branchName = ghView.stdout.toString().trim();
  if (!branchName) {
    console.error('❌ Failed to resolve PR branch.');
    process.exit(1);
  }

  const sessionName = `${prNumber}-${branchName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  // 2. Sync Configuration Mirror (Isolated Profile)
  const ISOLATED_CONFIG = '~/.gemini-deep-review';
  console.log(`📡 Mirroring environment to ${remoteHost}...`);
  spawnSync('ssh', [remoteHost, `mkdir -p ${remoteWorkDir}/.gemini/skills/deep-review/scripts/ ${ISOLATED_CONFIG}/policies/`]);
  
  spawnSync('rsync', ['-avz', '--delete', path.join(REPO_ROOT, '.gemini/skills/deep-review/scripts/'), `${remoteHost}:${remoteWorkDir}/.gemini/skills/deep-review/scripts/`]);

  if (syncAuth) {
    const homeDir = process.env.HOME || '';
    const localGeminiDir = path.join(homeDir, '.gemini');
    const syncFiles = ['google_accounts.json', 'settings.json'];
    for (const f of syncFiles) {
      const lp = path.join(localGeminiDir, f);
      if (fs.existsSync(lp)) spawnSync('rsync', ['-avz', lp, `${remoteHost}:${ISOLATED_CONFIG}/${f}`]);
    }
    const localPolicies = path.join(localGeminiDir, 'policies/');
    if (fs.existsSync(localPolicies)) spawnSync('rsync', ['-avz', '--delete', localPolicies, `${remoteHost}:${ISOLATED_CONFIG}/policies/`]);
    const localEnv = path.join(REPO_ROOT, '.env');
    if (fs.existsSync(localEnv)) spawnSync('rsync', ['-avz', localEnv, `${remoteHost}:${remoteWorkDir}/.env`]);
  }

  // 3. Construct Clean Command
  // We use a single entrypoint script to avoid quoting nightmares
  const envLoader = 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"';
  // Use the locally installed tsx binary
  const entryCmd = `cd ${remoteWorkDir} && ${envLoader} && export GEMINI_CLI_HOME=${ISOLATED_CONFIG} && ./node_modules/.bin/tsx .gemini/skills/deep-review/scripts/entrypoint.ts ${prNumber} ${branchName}`;
  
  const tmuxCmd = `$SHELL -ic ${q(entryCmd)}; exec $SHELL`;
  const sshInternal = `tmux attach-session -t ${sessionName} 2>/dev/null || tmux new-session -s ${sessionName} -n ${q(branchName)} ${q(tmuxCmd)}`;
  const sshCmd = `ssh -t ${remoteHost} ${q(sshInternal)}`;

  // 4. Smart Context Execution
  // If run from within a Gemini CLI session, we pop a new window.
  // Otherwise (running directly in shell), we execute in-place.
  const isWithinGemini = !!process.env.GEMINI_SESSION_ID || !!process.env.GCLI_SESSION_ID;

  if (isWithinGemini) {
    if (process.platform === 'darwin' && terminalType !== 'none') {
      // macOS: Use Window Automation
      let appleScript = '';
      if (terminalType === 'iterm2') {
        appleScript = `on run argv\n set theCommand to item 1 of argv\n tell application "iTerm"\n set newWindow to (create window with default profile)\n tell current session of newWindow\n write text theCommand\n end tell\n activate\n end tell\n end run`;
      } else if (terminalType === 'terminal') {
        appleScript = `on run argv\n set theCommand to item 1 of argv\n tell application "Terminal"\n do script theCommand\n activate\n end tell\n end run`;
      }

      if (appleScript) {
        spawnSync('osascript', ['-', sshCmd], { input: appleScript });
        console.log(`✅ ${terminalType.toUpperCase()} window opened for verification.`);
        return;
      }
    }

    // Cross-Platform Background Mode (within Gemini session)
    console.log(`📡 Launching remote verification in background mode...`);
    // Run SSH in background, redirecting output to a session log
    const logFile = path.join(REPO_ROOT, `.gemini/logs/review-${prNumber}/background.log`);
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    
    const backgroundCmd = `ssh ${remoteHost} ${q(entryCmd)} > ${q(logFile)} 2>&1 &`;
    spawnSync(backgroundCmd, { shell: true });
    
    console.log(`⏳ Remote worker started in background.`);
    console.log(`📄 Tailing logs to: .gemini/logs/review-${prNumber}/background.log`);
    return;
  }

  // Direct Shell Mode: Execute SSH in-place
  console.log(`🚀 Launching review session in current terminal...`);
  const result = spawnSync(sshCmd, { stdio: 'inherit', shell: true });
  process.exit(result.status || 0);
}

main().catch(console.error);
