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
  const userPrefix = `gcli-offload-${env.USER || 'mattkorwel'}`;

  console.log(`🔍 Finding active fleet workers for ${userPrefix}...`);

  // 2. Discover Worker VM
  const gcloudList = spawnSync(`gcloud compute instances list --project ${projectId} --filter="name~^${userPrefix} AND status=RUNNING" --format="json"`, { shell: true });

  let instances = [];
  try {
      instances = JSON.parse(gcloudList.stdout.toString());
  } catch (e) {
      console.error('❌ Failed to parse gcloud output. Ensure you are logged in.');
      return 1;
  }

  if (instances.length === 0) {
    console.log('⚠️ No active workers found. Please run "npm run offload:fleet provision" first.');
    return 1;
  }

  // Default to the first found worker
  const targetVM = instances[0].name;
  const remoteWorkDir = '/home/ubuntu/.offload/workspace';
  const sessionName = `offload-${prNumber}-${action}`;

  // Fetch Metadata (local)
  console.log(`🔍 Fetching metadata for ${action === 'implement' ? 'Issue' : 'PR'} #${prNumber}...`);
  const ghCmd = action === 'implement' 
    ? `gh issue view ${prNumber} --json title -q .title` 
    : `gh pr view ${prNumber} --json headRefName -q .headRefName`;
  
  const ghView = spawnSync(ghCmd, { shell: true });
  const metaName = ghView.stdout.toString().trim() || `task-${prNumber}`;
  const branchName = action === 'implement' ? `impl-${prNumber}` : metaName;

  console.log(`📡 Using worker: ${targetVM}`);

  // 3. Mirror logic
  const ISOLATED_GEMINI = '~/.offload/gemini-cli-config';
  const ISOLATED_GH = '~/.offload/gh-cli-config';
  const remotePolicyPath = `${ISOLATED_GEMINI}/policies/offload-policy.toml`;

  console.log(`📦 Synchronizing with ${targetVM}...`);
  spawnSync(`gcloud compute ssh ${targetVM} --project ${projectId} --zone ${zone} --command "mkdir -p ${remoteWorkDir} ${ISOLATED_GEMINI}/policies/"`, { shell: true });

  // Sync scripts and policy
  spawnSync(`rsync -avz -e "gcloud compute ssh --project ${projectId} --zone ${zone}" .gemini/skills/offload/policy.toml ${targetVM}:${remotePolicyPath}`, { shell: true });
  spawnSync(`rsync -avz --delete -e "gcloud compute ssh --project ${projectId} --zone ${zone}" .gemini/skills/offload/scripts/ ${targetVM}:${remoteWorkDir}/.gemini/skills/offload/scripts/`, { shell: true });

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
  const envLoader = 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"';
  const remoteWorker = `export GEMINI_CLI_HOME=${ISOLATED_GEMINI} && export GH_CONFIG_DIR=${ISOLATED_GH} && node_modules/.bin/tsx .gemini/skills/offload/scripts/entrypoint.ts ${prNumber} ${branchName} ${remotePolicyPath} ${action}`;
  const tmuxCmd = `cd ${remoteWorkDir} && ${envLoader} && ${remoteWorker}; exec $SHELL`;
  
  const sshInternal = `tmux attach-session -t ${sessionName} 2>/dev/null || tmux new-session -s ${sessionName} -n 'offload' ${q(tmuxCmd)}`;
  const finalSSH = `gcloud compute ssh ${targetVM} --project ${projectId} --zone ${zone} -- -t ${q(sshInternal)}`;

  // 5. Terminal Automation
  const isWithinGemini = !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;
  if (isWithinGemini) {
    const appleScript = `on run argv\n tell application "iTerm"\n set newWindow to (create window with default profile)\n tell current session of newWindow\n write text (item 1 of argv)\n end tell\n activate\n end tell\n end run`;
    spawnSync('osascript', ['-', finalSSH], { input: appleScript });
    console.log(`✅ iTerm2 window opened on ${targetVM}.`);
    return 0;
  }

  spawnSync(finalSSH, { stdio: 'inherit', shell: true });
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestrator(process.argv.slice(2)).catch(console.error);
}
