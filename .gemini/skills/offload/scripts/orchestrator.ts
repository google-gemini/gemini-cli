/**
 * Universal Offload Orchestrator (Local)
 * 
 * Automatically detects and connects to your dynamic GCE fleet.
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

  // 1. Load GCP Settings
  const settingsPath = path.join(REPO_ROOT, '.gemini/settings.json');
  if (!fs.existsSync(settingsPath)) {
      console.error('❌ Settings not found. Run "npm run offload:setup" first.');
      return 1;
  }
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.maintainer?.deepReview;
  if (!config) {
    console.error('❌ Fleet settings not found. Run "npm run offload:setup" first.');
    return 1;
  }

  const { projectId, zone, terminalType, syncAuth } = config;
  const targetVM = `gcli-offload-${env.USER || 'mattkorwel'}`;

  console.log(`🔍 Connecting to offload worker: ${targetVM}...`);

  // 1. Get remote HOME and Status
  const infoCheck = spawnSync(`gcloud compute ssh ${targetVM} --project ${projectId} --zone ${zone} --command "echo \$HOME && gcloud compute instances describe ${targetVM} --project ${projectId} --zone ${zone} --format='get(status)'"`, { shell: true });
  const infoOutput = infoCheck.stdout.toString().trim().split('\n');
  const remoteHome = infoOutput[0] || '/home/ubuntu';
  const status = infoOutput[infoOutput.length - 1] || 'RUNNING';

  console.log(`DEBUG: Remote Home: ${remoteHome}, Status: ${status}`);

  if (status !== 'RUNNING' && status !== 'PROVISIONING' && status !== 'STAGING') {
    console.log(`⚠️ Worker ${targetVM} is ${status}. Starting it now...`);
    spawnSync(`gcloud compute instances start ${targetVM} --project ${projectId} --zone ${zone}`, { shell: true, stdio: 'inherit' });
  }

  const remoteWorkDir = `${remoteHome}/.offload/workspace`;
  const ISOLATED_GEMINI = `${remoteHome}/.offload/gemini-cli-config`;
  const ISOLATED_GH = `${remoteHome}/.offload/gh-cli-config`;
  const remotePolicyPath = `${ISOLATED_GEMINI}/policies/offload-policy.toml`;

  const sessionName = `offload-${prNumber}-${action}`;

  // Fetch Metadata (local)
  console.log(`🔍 Fetching metadata for ${action === 'implement' ? 'Issue' : 'PR'} #${prNumber}...`);
  const ghCmd = action === 'implement' 
    ? `gh issue view ${prNumber} --json title -q .title` 
    : `gh pr view ${prNumber} --json headRefName -q .headRefName`;
  
  const ghView = spawnSync(ghCmd, { shell: true });
  const metaName = ghView.stdout.toString().trim() || `task-${prNumber}`;
  const branchName = action === 'implement' ? `impl-${prNumber}` : metaName;
  console.log(`DEBUG: Branch name for session: ${branchName}`);

  console.log(`📦 Synchronizing with ${targetVM}...`);
  spawnSync(`gcloud compute ssh ${targetVM} --project ${projectId} --zone ${zone} --command "mkdir -p ${remoteWorkDir} ${ISOLATED_GEMINI}/policies/"`, { shell: true });

  // Sync manifests and scripts
  const rsyncBase = `rsync -avz -e "gcloud compute ssh --project ${projectId} --zone ${zone}"`;
  spawnSync(`${rsyncBase} package.json package-lock.json .gemini/skills/offload/policy.toml ${targetVM}:${remoteWorkDir}/`, { shell: true });
  spawnSync(`${rsyncBase} .gemini/skills/offload/policy.toml ${targetVM}:${remotePolicyPath}`, { shell: true });
  spawnSync(`${rsyncBase} --delete .gemini/skills/offload/scripts/ ${targetVM}:${remoteWorkDir}/.gemini/skills/offload/scripts/`, { shell: true });

  if (syncAuth) {
    const homeDir = env.HOME || '';
    const localGeminiDir = path.join(homeDir, '.gemini');
    const syncFiles = ['google_accounts.json', 'settings.json'];
    for (const f of syncFiles) {
      const lp = path.join(localGeminiDir, f);
      if (fs.existsSync(lp)) {
        spawnSync(`rsync -avz -e "gcloud compute ssh --project ${projectId} --zone ${zone}" ${lp} ${targetVM}:${ISOLATED_GEMINI}/${f}`, { shell: true });
      }
    }
  }

  // 4. Construct Command
  const remoteWorker = `export GEMINI_CLI_HOME=${ISOLATED_GEMINI} && export GH_CONFIG_DIR=${ISOLATED_GH} && [ -d node_modules ] || npm install --no-audit --no-fund && node_modules/.bin/tsx .gemini/skills/offload/scripts/entrypoint.ts ${prNumber} ${branchName} ${remotePolicyPath} ${action}`;
  const tmuxCmd = `cd ${remoteWorkDir} && ${remoteWorker}; exec $SHELL`;
  
  const gcloudPath = spawnSync('which', ['gcloud'], { stdio: 'pipe' }).stdout.toString().trim() || 'gcloud';
  
  const sshInternal = `tmux attach-session -t ${sessionName} 2>/dev/null || tmux new-session -s ${sessionName} -n 'offload' ${q(tmuxCmd)}`;
  const finalSSH = `${gcloudPath} compute ssh ${targetVM} --project ${projectId} --zone ${zone} -- -t ${q(sshInternal)}`;

  console.log(`DEBUG: Final SSH command: ${finalSSH}`);

  // 5. Terminal Automation
  const isWithinGemini = !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;
  console.log(`DEBUG: isWithinGemini: ${isWithinGemini}`);

  if (isWithinGemini && terminalType === 'iterm2') {
    // Write the command to a temp file to avoid AppleScript/Shell mangling
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
    console.log(`✅ iTerm2 window opened on ${targetVM}.`);
    return 0;
  }


  console.log('🚀 Launching interactive session...');
  spawnSync(finalSSH, { stdio: 'inherit', shell: true });
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestrator(process.argv.slice(2)).catch(console.error);
}
