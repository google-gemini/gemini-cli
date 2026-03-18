/**
 * Universal Offload Onboarding (Local)
 * 
 * Configures the GCP Project and performs one-time initialization of the worker.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { ProviderFactory } from './providers/ProviderFactory.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

async function prompt(question: string, defaultValue: string): Promise<string> {
  const autoAccept = process.argv.includes('--yes') || process.argv.includes('-y');
  if (autoAccept && defaultValue) return defaultValue;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (default: ${defaultValue}, <Enter> to use default): `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function confirm(question: string): Promise<boolean> {
  const autoAccept = process.argv.includes('--yes') || process.argv.includes('-y');
  if (autoAccept) return true;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function runSetup(env: NodeJS.ProcessEnv = process.env) {
  console.log(`
================================================================================
🚀 GEMINI CLI: HIGH-PERFORMANCE OFFLOAD SYSTEM
================================================================================
The offload system allows you to delegate heavy tasks (PR reviews, agentic fixes,
and full builds) to a dedicated, high-performance GCP worker.

This script will:
1. Identify/Provision your dedicated worker (gcli-offload-${env.USER || 'user'})
2. Configure "Magic" corporate network routing (nic0 + IAP)
3. Synchronize your local credentials and orchestration logic
4. Initialize a remote repository for parallel worktree execution
================================================================================
  `);

  const defaultProject = env.GOOGLE_CLOUD_PROJECT || '';
  const projectId = await prompt('GCP Project ID', defaultProject);
  
  if (!projectId) {
      console.error('❌ Project ID is required. Set GOOGLE_CLOUD_PROJECT or enter it manually.');
      return 1;
  }

  const zone = await prompt('Compute Zone', 'us-west1-a');
  const terminalTarget = await prompt('Terminal UI Target (tab or window)', 'tab');
  const targetVM = `gcli-offload-${env.USER || 'mattkorwel'}`;
  
  console.log('\n🔍 Phase 1: Identity & Discovery');
  // Early save of discovery info so fleet commands can work
  const initialSettingsPath = path.join(REPO_ROOT, '.gemini/offload/settings.json');
  if (!fs.existsSync(path.dirname(initialSettingsPath))) fs.mkdirSync(path.dirname(initialSettingsPath), { recursive: true });
  const initialSettings = fs.existsSync(initialSettingsPath) ? JSON.parse(fs.readFileSync(initialSettingsPath, 'utf8')) : {};
  initialSettings.deepReview = { ...initialSettings.deepReview, projectId, zone, terminalTarget };
  fs.writeFileSync(initialSettingsPath, JSON.stringify(initialSettings, null, 2));

  const provider = ProviderFactory.getProvider({ projectId, zone, instanceName: targetVM });

  console.log(`   - Verifying access and finding worker ${targetVM}...`);
  let status = await provider.getStatus();
  
  if (status.status === 'UNKNOWN' || status.status === 'ERROR') {
    console.log('\n🏗️  Phase 2: Infrastructure Provisioning');
    const shouldProvision = await confirm(`   - Worker ${targetVM} not found. Provision it now in project ${projectId}?`);
    if (!shouldProvision) {
      console.log('🛑 Aborting setup.');
      return 1;
    }
    const provisionRes = await provider.provision();
    if (provisionRes !== 0) {
      console.error('❌ Provisioning failed.');
      return 1;
    }
    // Refresh status after provisioning
    status = await provider.getStatus();
  }

  if (status.status !== 'RUNNING') {
    console.log('   - Waking up worker...');
    await provider.ensureReady();
  }

  // 1. Configure Isolated SSH Alias (Direct Internal Path with IAP Fallback)
  console.log(`\n🚀 Phase 3: Network & Connectivity`);
  const dnsSuffix = await prompt('   - Internal DNS Suffix', '.internal.gcpnode.com');

  const setupRes = await provider.setup({ projectId, zone, dnsSuffix });
  if (setupRes !== 0) return setupRes;

  const offloadDir = path.join(REPO_ROOT, '.gemini/offload');
  const sshConfigPath = path.join(offloadDir, 'ssh_config');
  const knownHostsPath = path.join(offloadDir, 'known_hosts');

  // 1b. Security Fork Management
  console.log('🔍 Detecting repository origins...');
  const repoInfoRes = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner,parent,isFork'], { stdio: 'pipe' });
  let upstreamRepo = 'google-gemini/gemini-cli';
  let userFork = upstreamRepo;

  if (repoInfoRes.status === 0) {
      try {
          const repoInfo = JSON.parse(repoInfoRes.stdout.toString());
          if (repoInfo.isFork && repoInfo.parent) {
              upstreamRepo = repoInfo.parent.nameWithOwner;
              userFork = repoInfo.nameWithOwner;
              console.log(`   - Detected Fork: ${userFork} (Upstream: ${upstreamRepo})`);
          } else {
              console.log(`   - Working on Upstream: ${upstreamRepo}`);
          }
      } catch (e) {
          console.log('   ⚠️ Failed to parse repo info. Using defaults.');
      }
  }

  // Resolve Paths
  const remoteWorkDir = `~/dev/main`;
  const persistentScripts = `~/.offload/scripts`;

  console.log(`\n📦 Performing One-Time Synchronization...`);
  
  // Ensure host directories exist (using provider.exec to handle IAP fallback)
  await provider.exec(`mkdir -p ~/dev/main ~/.gemini/policies ~/.offload/scripts`);

  // 2. Sync Scripts & Policies
  console.log('   - Pushing offload logic to persistent worker directory...');
  await provider.sync('.gemini/skills/offload/scripts/', `${persistentScripts}/`, { delete: true });
  await provider.sync('.gemini/skills/offload/policy.toml', `~/.gemini/policies/offload-policy.toml`);

  // 3. Sync Auth (Gemini)
  if (await confirm('Sync Gemini accounts credentials?')) {
    const homeDir = env.HOME || '';
    const lp = path.join(homeDir, '.gemini/google_accounts.json');
    if (fs.existsSync(lp)) {
      await provider.sync(lp, `~/.gemini/google_accounts.json`);
    }
  }

  // 4. Scoped Token Onboarding
  if (await confirm('Generate a scoped, secure token for the autonomous agent? (Recommended)')) {
    const baseUrl = 'https://github.com/settings/personal-access-tokens/new';
    const name = `Offload-${env.USER}`;
    const repoParams = userFork !== upstreamRepo 
        ? `&repositories[]=${encodeURIComponent(upstreamRepo)}&repositories[]=${encodeURIComponent(userFork)}`
        : `&repositories[]=${encodeURIComponent(upstreamRepo)}`;

    const magicLink = `${baseUrl}?name=${encodeURIComponent(name)}&description=Gemini+CLI+Offload+Worker${repoParams}&contents=write&pull_requests=write&metadata=read`;

    // Use OSC 8 for a proper clickable terminal link (no line wrapping issues)
    const terminalLink = `\u001b]8;;${magicLink}\u0007${magicLink}\u001b]8;;\u0007`;

    console.log('\n🔐 SECURITY: Create a token using the link below:');
    console.log(`\n${terminalLink}\n`);
    console.log('👉 INSTRUCTIONS:');
    console.log('1. Click the link above.');
    console.log('2. Under "Repository access", select "Only select repositories".');
    console.log(`3. Select "${upstreamRepo}" and "${userFork}".`);
    console.log('4. Click "Generate token" at the bottom.');

    const scopedToken = await prompt('\nPaste Scoped Token', '');
    if (scopedToken) {
      await provider.exec(`mkdir -p /home/node/.offload && echo ${scopedToken} > /home/node/.offload/.gh_token && chmod 600 /home/node/.offload/.gh_token`);
    }
  }

  // 5. Tooling & Clone
  if (await confirm('Initialize tools and clone repository?')) {
    console.log(`🚀 Cloning fork ${userFork} on worker...`);
    const repoUrl = `https://github.com/${userFork}.git`;
    
    // Wipe existing dir for a clean clone and use absolute paths
    const cloneCmd = `rm -rf ${remoteWorkDir} && git clone --filter=blob:none ${repoUrl} ${remoteWorkDir} && cd ${remoteWorkDir} && git remote add upstream https://github.com/${upstreamRepo}.git && git fetch upstream`;
    await provider.exec(cloneCmd);

    console.log('📦 Installing remote dependencies (this may take a few minutes)...');
    await provider.exec(`cd ${remoteWorkDir} && npm ci`);
  }

  // Save Settings
  const settingsPath = path.join(REPO_ROOT, '.gemini/offload/settings.json');
  let settings: any = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
  }
  settings.deepReview = { 
    projectId, zone, 
    remoteHost: 'gcli-worker', 
    remoteWorkDir, userFork, upstreamRepo,
    useContainer: true,
    terminalType: 'iterm2'
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  
  console.log('\n✅ Initialization complete!');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch(console.error);
}

