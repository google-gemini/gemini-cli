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
  const useContainer = await confirm('Use Container-Native mode (Container-Optimized OS)?');

  console.log(`🔍 Verifying access and finding worker ${targetVM}...`);
  const statusCheck = spawnSync(`gcloud compute instances describe ${targetVM} --project ${projectId} --zone ${zone} --format="json(status,networkInterfaces[0].accessConfigs[0].natIP)"`, { shell: true });
  
  let instanceData: any;
  try {
    const output = statusCheck.stdout.toString().trim();
    if (!output) throw new Error('Empty output');
    instanceData = JSON.parse(output);
  } catch (e) {
    console.error(`❌ Worker ${targetVM} not found or error fetching status. Run "npm run offload:fleet provision" first.`);
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
  }

  // 1b. Security Fork Management
  console.log('\n🍴 Configuring Security Fork...');
  const upstreamRepo = 'google-gemini/gemini-cli';
  const forksQuery = spawnSync('gh', ['api', 'user/repos', '--paginate', '-q', `.[] | select(.fork == true and .parent.full_name == "${upstreamRepo}") | .full_name`], { stdio: 'pipe' });
  const existingForks = forksQuery.stdout.toString().trim().split('\n').filter(Boolean);

  let userFork = '';
  if (existingForks.length > 0) {
      if (await confirm(`   Found existing fork ${existingForks[0]}. Use it?`)) {
          userFork = existingForks[0];
      }
  }

  if (!userFork) {
      console.log(`   🔍 Creating a fresh personal fork...`);
      spawnSync('gh', ['repo', 'fork', upstreamRepo, '--clone=false'], { stdio: 'inherit' });
      const user = spawnSync('gh', ['api', 'user', '-q', '.login'], { stdio: 'pipe' }).stdout.toString().trim();
      userFork = `${user}/gemini-cli`;
  }
  
  console.log(`   ✅ Using fork: ${userFork}`);

  // Resolve Paths (Simplified with Tilde)
  const remoteHost = sshAlias;
  const remoteWorkDir = `~/dev/main`;
  const persistentScripts = `~/.offload/scripts`;

  console.log(`\n📦 Performing One-Time Synchronization...`);
  spawnSync(`ssh ${remoteHost} "mkdir -p ${remoteWorkDir} ~/.gemini/policies ${persistentScripts}"`, { shell: true });

  const rsyncBase = `rsync -avz -e "ssh"`;

  // 2. Sync Settings & Policies
  if (await confirm('Sync local settings and security policies?')) {
    const localSettings = path.join(REPO_ROOT, '.gemini/settings.json');
    if (fs.existsSync(localSettings)) {
      spawnSync(`${rsyncBase} ${localSettings} ${remoteHost}:~/.gemini/`, { shell: true });
    }
    spawnSync(`${rsyncBase} .gemini/skills/offload/policy.toml ${remoteHost}:~/.gemini/policies/offload-policy.toml`, { shell: true });
  }

  // 3. Sync Auth (Gemini)
  if (await confirm('Sync Gemini accounts credentials?')) {
    const homeDir = env.HOME || '';
    const lp = path.join(homeDir, '.gemini/google_accounts.json');
    if (fs.existsSync(lp)) {
      spawnSync(`${rsyncBase} ${lp} ${remoteHost}:~/.gemini/google_accounts.json`, { shell: true });
    }
  }

  // 4. Scoped Token Onboarding
  if (await confirm('Generate a scoped, secure token for the autonomous agent? (Recommended)')) {
    const magicLink = `https://github.com/settings/tokens/beta/new?description=Offload-${env.USER}&repositories[]=${encodeURIComponent(upstreamRepo)}&repositories[]=${encodeURIComponent(userFork)}&permissions[contents]=write&permissions[pull_requests]=write&permissions[metadata]=read`;
    console.log(`\n🔐 SECURITY: Create a token here:\n\x1b[34m${magicLink}\x1b[0m`);
    const scopedToken = await prompt('\nPaste Scoped Token', '');
    if (scopedToken) {
      spawnSync(`ssh ${remoteHost} "mkdir -p ~/.offload && echo ${scopedToken} > ~/.offload/.gh_token && chmod 600 ~/.offload/.gh_token"`, { shell: true });
    }
  }

  // 5. Tooling & Clone
  if (await confirm('Initialize tools and clone repository?')) {
    if (!useContainer) {
      spawnSync(`ssh ${remoteHost} "sudo npm install -g tsx vitest"`, { shell: true, stdio: 'inherit' });
    }

    console.log(`🚀 Cloning fork ${userFork} on worker...`);
    const repoUrl = `https://github.com/${userFork}.git`;
    const cloneCmd = `[ -d ${remoteWorkDir}/.git ] || (git clone --filter=blob:none ${repoUrl} ${remoteWorkDir} && cd ${remoteWorkDir} && git remote add upstream https://github.com/${upstreamRepo}.git && git fetch upstream)`;
    spawnSync(`ssh ${remoteHost} ${JSON.stringify(cloneCmd)}`, { shell: true, stdio: 'inherit' });
  }

  // Save Settings
  const settingsPath = path.join(REPO_ROOT, '.gemini/settings.json');
  let settings: any = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
  }
  settings.maintainer = settings.maintainer || {};
  settings.maintainer.deepReview = { 
    projectId, zone, remoteHost, 
    remoteWorkDir, userFork, upstreamRepo,
    useContainer,
    terminalType: 'iterm2'
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  
  console.log('\n✅ Initialization complete!');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch(console.error);
}
