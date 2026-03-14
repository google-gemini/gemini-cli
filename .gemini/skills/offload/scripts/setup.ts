/**
 * Universal Offload Onboarding (Local)
 * 
 * Configures the GCP Project and performs one-time initialization of the worker.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

async function prompt(question: string, defaultValue: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (default: ${defaultValue}, <Enter> to use default): `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function runSetup(env: NodeJS.ProcessEnv = process.env) {
  console.log('\n🌟 Initializing Dedicated Offload Worker...');

  const projectId = await prompt('GCP Project ID', 'gemini-cli-team-quota');
  const zone = await prompt('Compute Zone', 'us-west1-a');
  const targetVM = `gcli-offload-${env.USER || 'mattkorwel'}`;

  console.log(`🔍 Verifying access and finding worker ${targetVM}...`);
  const statusCheck = spawnSync(`gcloud compute instances describe ${targetVM} --project ${projectId} --zone ${zone} --format="json(status,networkInterfaces[0].accessConfigs[0].natIP)"`, { shell: true });
  
  let instanceData: any;
  try {
    instanceData = JSON.parse(statusCheck.stdout.toString());
  } catch (e) {
    console.error(`❌ Worker ${targetVM} not found. Run "npm run offload:fleet provision" first.`);
    return 1;
  }

  const status = instanceData.status;
  const publicIp = instanceData.networkInterfaces[0].accessConfigs[0].natIP;

  if (status !== 'RUNNING') {
    console.log(`⚠️ Worker is ${status}. Starting it for initialization...`);
    spawnSync(`gcloud compute instances start ${targetVM} --project ${projectId} --zone ${zone}`, { shell: true, stdio: 'inherit' });
  }

  // 1. Configure Fast-Path SSH Alias
  console.log(`\n🚀 Configuring Fast-Path SSH Alias...`);
  const sshAlias = 'gcli-worker';
  const sshConfigPath = path.join(os.homedir(), '.ssh/config');
  const sshEntry = `
Host ${sshAlias}
    HostName ${publicIp}
    IdentityFile ~/.ssh/google_compute_engine
    User ${env.USER || 'mattkorwel'}_google_com
    CheckHostIP no
    StrictHostKeyChecking no
`;

  let currentConfig = '';
  if (fs.existsSync(sshConfigPath)) currentConfig = fs.readFileSync(sshConfigPath, 'utf8');

  if (!currentConfig.includes(`Host ${sshAlias}`)) {
    fs.appendFileSync(sshConfigPath, sshEntry);
    console.log(`   ✅ Added '${sshAlias}' alias to ~/.ssh/config`);
  } else {
    console.log(`   ℹ️  '${sshAlias}' alias already exists in ~/.ssh/config`);
  }

  // 1. Configure Fast-Path SSH Alias
  // ... (unchanged)

  // Use the alias for remaining setup steps
  const remoteHost = sshAlias;
  const remoteHome = spawnSync(`ssh ${remoteHost} "pwd"`, { shell: true }).stdout.toString().trim();
  const remoteWorkDir = `${remoteHome}/dev/main`;
  const persistentScripts = `${remoteHome}/.offload/scripts`;

  console.log(`\n📦 Performing One-Time Synchronization...`);
  spawnSync(`ssh ${remoteHost} "mkdir -p ${remoteWorkDir} ${remoteHome}/.gemini/policies ${persistentScripts}"`, { shell: true });

  // Sync offload scripts to persistent location
  console.log('   - Pushing offload logic to persistent worker directory...');
  spawnSync(`rsync -avz --delete .gemini/skills/offload/scripts/ ${remoteHost}:${persistentScripts}/`, { shell: true });
  spawnSync(`rsync -avz .gemini/skills/offload/policy.toml ${remoteHost}:${remoteHome}/.gemini/policies/offload-policy.toml`, { shell: true });

  // 3. Sync Auth (Gemini)
  if (await confirm('Sync Gemini accounts credentials?')) {
    const homeDir = env.HOME || '';
    const lp = path.join(homeDir, '.gemini/google_accounts.json');
    if (fs.existsSync(lp)) {
      console.log(`   - Syncing .gemini/google_accounts.json...`);
      spawnSync(`rsync -avz ${lp} ${remoteHost}:${remoteHome}/.gemini/google_accounts.json`, { shell: true });
    }
  }

  // 4. Remote GitHub Login
  if (await confirm('Authenticate GitHub CLI on the worker?')) {
    console.log('\n🔐 Performing non-interactive GitHub CLI authentication on worker...');
    const localToken = spawnSync('gh', ['auth', 'token'], { stdio: 'pipe' }).stdout.toString().trim();
    if (!localToken) {
      console.error('❌ Could not find local GitHub token. Please log in locally first with "gh auth login".');
      return 1;
    }

    // Pipe the local token to the remote worker's gh auth login
    const loginCmd = `gh auth login --with-token --insecure-storage`;
    const result = spawnSync(`echo ${localToken} | ssh ${remoteHost} ${JSON.stringify(loginCmd)}`, { shell: true, stdio: 'inherit' });
    
    if (result.status === 0) {
      console.log('✅ GitHub CLI authenticated successfully on worker.');
      // Set git protocol to https by default for simplicity
      spawnSync(`ssh ${remoteHost} "gh config set git_protocol https"`, { shell: true });
    } else {
      console.error('❌ GitHub CLI authentication failed on worker.');
    }
  }

  // 5. Global Tooling & Clone
  if (await confirm('Configure global tools (tsx, vitest) and clone repository?')) {
    console.log('🚀 Installing global developer tools...');
    spawnSync(`ssh ${remoteHost} "sudo npm install -g tsx vitest"`, { shell: true, stdio: 'inherit' });

    console.log('🚀 Cloning repository (blob-less) on worker...');
    const repoUrl = 'https://github.com/google-gemini/gemini-cli.git';
    const cloneCmd = `[ -d ${remoteWorkDir}/.git ] || git clone --filter=blob:none ${repoUrl} ${remoteWorkDir}`;
    spawnSync(`ssh ${remoteHost} ${JSON.stringify(cloneCmd)}`, { shell: true, stdio: 'inherit' });
    
    // We skip the full npm install here as requested; per-worktree builds will handle it if needed.
  }

  // Save Settings
  const settingsPath = path.join(REPO_ROOT, '.gemini/settings.json');
  let settings: any = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
  }
  settings.maintainer = settings.maintainer || {};
  settings.maintainer.deepReview = { 
    projectId, 
    zone, 
    remoteHost,
    remoteHome,
    remoteWorkDir,
    terminalType: 'iterm2'
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  
  console.log('\n✅ Initialization complete! Your dedicated worker is ready via fast-path SSH.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch(console.error);
}
