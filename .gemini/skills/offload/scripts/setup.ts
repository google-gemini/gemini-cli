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

  const defaultProject = env.GOOGLE_CLOUD_PROJECT || '';
  const projectId = await prompt('GCP Project ID', defaultProject);
  
  if (!projectId) {
      console.error('❌ Project ID is required. Set GOOGLE_CLOUD_PROJECT or enter it manually.');
      return 1;
  }

  const zone = await prompt('Compute Zone', 'us-west1-a');
  const targetVM = `gcli-offload-${env.USER || 'mattkorwel'}`;
  
  const provider = ProviderFactory.getProvider({ projectId, zone, instanceName: targetVM });

  console.log(`🔍 Verifying access and finding worker ${targetVM}...`);
  const status = await provider.getStatus();
  
  if (status.status === 'UNKNOWN' || status.status === 'ERROR') {
    console.error(`❌ Worker ${targetVM} not found or error fetching status. Run "npm run offload:fleet provision" first.`);
    return 1;
  }

  if (status.status !== 'RUNNING') {
    await provider.ensureReady();
  }

  // 1. Configure Isolated SSH Alias (Direct Internal Path with IAP Fallback)
  console.log(`\n🚀 Configuring Isolated SSH Alias...`);
  const dnsSuffix = await prompt('Internal DNS Suffix', '.internal');

  const setupRes = await provider.setup({ projectId, zone, dnsSuffix });
  if (setupRes !== 0) return setupRes;

  const offloadDir = path.join(REPO_ROOT, '.gemini/offload');
  const sshConfigPath = path.join(offloadDir, 'ssh_config');
  const knownHostsPath = path.join(offloadDir, 'known_hosts');

  // 1b. Security Fork Management (Temporarily Disabled)
  const upstreamRepo = 'google-gemini/gemini-cli';
  const userFork = upstreamRepo; // Fallback for now

  // Resolve Paths
  const remoteWorkDir = `/home/node/dev/main`;
  const persistentScripts = `/home/node/.offload/scripts`;

  console.log(`\n📦 Performing One-Time Synchronization...`);
  
  // Ensure host directories exist (using provider.exec to handle IAP fallback)
  await provider.exec(`mkdir -p /home/node/dev/main /home/node/.gemini/policies /home/node/.offload/scripts`);

  // 2. Sync Scripts & Policies
  console.log('   - Pushing offload logic to persistent worker directory...');
  await provider.sync('.gemini/skills/offload/scripts/', `${persistentScripts}/`, { delete: true });
  await provider.sync('.gemini/skills/offload/policy.toml', `/home/node/.gemini/policies/offload-policy.toml`);

  // 3. Sync Auth (Gemini)
  if (await confirm('Sync Gemini accounts credentials?')) {
    const homeDir = env.HOME || '';
    const lp = path.join(homeDir, '.gemini/google_accounts.json');
    if (fs.existsSync(lp)) {
      await provider.sync(lp, `/home/node/.gemini/google_accounts.json`);
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

    console.log('\n🔐 SECURITY: Create a token using the link below:');
    console.log('\n' + magicLink + '\n');
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

