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
  const statusCheck = spawnSync(`gcloud compute instances describe ${targetVM} --project ${projectId} --zone ${zone} --format="json(status,networkInterfaces[0].networkIP)"`, { shell: true });
  
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
  const internalIp = instanceData.networkInterfaces[0].networkIP;

  if (status !== 'RUNNING') {
    console.log(`⚠️ Worker is ${status}. Starting it for initialization...`);
    spawnSync(`gcloud compute instances start ${targetVM} --project ${projectId} --zone ${zone}`, { shell: true, stdio: 'inherit' });
  }

  // 1. Configure Fast-Path SSH Alias (Direct Internal Hostname)
  console.log(`\n🚀 Configuring Fast-Path SSH Alias (Internal Hostname)...`);
  const dnsSuffix = await prompt('Internal DNS Suffix (e.g. .internal or .internal.gcpnode.com)', '.internal');
  
  // Construct the high-performance direct hostname
  const internalHostname = `${targetVM}.${zone}.c.${projectId}${dnsSuffix}`;
  const sshAlias = 'gcli-worker';
  const sshConfigPath = path.join(os.homedir(), '.ssh/config');
  
  const sshEntry = `
Host ${sshAlias}
    HostName ${internalHostname}
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
  
  // 1. Check for existing fork FIRST
  const forksQuery = spawnSync('gh', ['api', 'user/repos', '--paginate', '-q', `.[] | select(.fork == true and .parent.full_name == "${upstreamRepo}") | .full_name`], { stdio: 'pipe' });
  const existingForks = forksQuery.stdout.toString().trim().split('\n').filter(Boolean);

  let userFork = '';
  if (existingForks.length > 0) {
      console.log(`   🔍 Found existing fork: ${existingForks[0]}`);
      if (await confirm(`   Use this fork?`)) {
          userFork = existingForks[0];
      }
  }

  // 2. Only create if no fork was selected
  if (!userFork) {
      console.log(`   🔍 Creating a fresh personal fork of ${upstreamRepo}...`);
      const forkResult = spawnSync('gh', ['repo', 'fork', upstreamRepo, '--clone=false'], { stdio: 'inherit' });
      if (forkResult.status === 0) {
          const user = spawnSync('gh', ['api', 'user', '-q', '.login'], { stdio: 'pipe' }).stdout.toString().trim();
          userFork = `${user}/gemini-cli`;
      } else {
          // If fork creation failed, try to fallback to the default name
          const user = spawnSync('gh', ['api', 'user', '-q', '.login'], { stdio: 'pipe' }).stdout.toString().trim();
          userFork = `${user}/gemini-cli`;
          console.log(`   ⚠️  Fork creation returned non-zero. Assuming fork is at: ${userFork}`);
      }
  }
  
  console.log(`   ✅ Target fork: ${userFork}`);

  // ... (Resolve Paths unchanged)

  // 4. Scoped Token Onboarding
  if (await confirm('Generate a scoped, secure token for the autonomous agent? (Recommended)')) {
    const magicLink = `https://github.com/settings/tokens/beta/new?description=Offload-${env.USER}&repositories[]=${encodeURIComponent(upstreamRepo)}&repositories[]=${encodeURIComponent(userFork)}&permissions[contents]=write&permissions[pull_requests]=write&permissions[metadata]=read`;
    
    console.log('\n🔐 SECURITY: Create a token using the link below:');
    // Print as a single line with bright blue color for visibility
    process.stdout.write(`\x1b[1;34m${magicLink}\x1b[0m\n`);
    
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
