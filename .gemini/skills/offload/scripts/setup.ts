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

  if (status !== 'RUNNING') {
    console.log(`⚠️ Worker is ${status}. Starting it for initialization...`);
    spawnSync(`gcloud compute instances start ${targetVM} --project ${projectId} --zone ${zone}`, { shell: true, stdio: 'inherit' });
  }

  // 1. Configure Isolated SSH Alias (Project-Specific)
  console.log(`\n🚀 Configuring Isolated SSH Alias...`);
  let dnsSuffix = await prompt('Internal DNS Suffix (e.g. .internal or .internal.gcpnode.com)', '.internal');
  
  // FIX: Ensure suffix starts with a dot
  if (dnsSuffix && !dnsSuffix.startsWith('.')) dnsSuffix = '.' + dnsSuffix;
  
  const internalHostname = `${targetVM}.${zone}.c.${projectId}${dnsSuffix}`;

  const sshAlias = 'gcli-worker';
  const sshConfigPath = path.join(REPO_ROOT, '.gemini/offload_ssh_config');
  const knownHostsPath = path.join(REPO_ROOT, '.gemini/offload_known_hosts');

  const sshEntry = `
Host ${sshAlias}
    HostName ${internalHostname}
    IdentityFile ~/.ssh/google_compute_engine
    User ${env.USER || 'mattkorwel'}_google_com
    UserKnownHostsFile ${knownHostsPath}
    CheckHostIP no
    StrictHostKeyChecking no
`;

  fs.writeFileSync(sshConfigPath, sshEntry);
  console.log(`   ✅ Created project SSH config: ${sshConfigPath}`);

  // 1b. Security Fork Management (Temporarily Disabled)
  const upstreamRepo = 'google-gemini/gemini-cli';
  const userFork = upstreamRepo; // Fallback for now

  // Resolve Paths
  const sshCmd = `ssh -F ${sshConfigPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=${knownHostsPath}`;
  const remoteHost = sshAlias;
  const remoteHome = '/home/node'; // Hardcoded for our maintainer container
  const remoteWorkDir = `/home/node/dev/main`; // Use absolute path
  const persistentScripts = `/home/node/.offload/scripts`;

  console.log(`\n📦 Performing One-Time Synchronization...`);
  
  // Trigger any SSH/SSO prompts before bulk sync
  console.log('   - Verifying connection and triggering SSO...');
  const connCheck = spawnSync(sshCmd, [remoteHost, 'echo 1'], { stdio: 'inherit', shell: true });
  if (connCheck.status !== 0) {
      console.error('\n❌ SSH connection failed. Please ensure you have run "gcert" recently.');
      return 1;
  }

  // Ensure host directories exist (on the VM Host)
  spawnSync(sshCmd, [remoteHost, `mkdir -p /home/node/dev/main /home/node/.gemini/policies /home/node/.offload/scripts`], { shell: true });

  const rsyncBase = `rsync -avz -e "${sshCmd}" --exclude=".gemini/settings.json"`;
  
  // 2. Sync Scripts & Policies
  console.log('   - Pushing offload logic to persistent worker directory...');
  spawnSync(`${rsyncBase} --delete .gemini/skills/offload/scripts/ ${remoteHost}:${persistentScripts}/`, { shell: true });
  spawnSync(`${rsyncBase} .gemini/skills/offload/policy.toml ${remoteHost}:/home/node/.gemini/policies/offload-policy.toml`, { shell: true });

  // 3. Sync Auth (Gemini)
  if (await confirm('Sync Gemini accounts credentials?')) {
    const homeDir = env.HOME || '';
    const lp = path.join(homeDir, '.gemini/google_accounts.json');
    if (fs.existsSync(lp)) {
      spawnSync(`${rsyncBase} ${lp} ${remoteHost}:/home/node/.gemini/google_accounts.json`, { shell: true });
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
      spawnSync(sshCmd, [remoteHost, `mkdir -p /home/node/.offload && echo ${scopedToken} > /home/node/.offload/.gh_token && chmod 600 /home/node/.offload/.gh_token`], { shell: true });
    }
  }

  // 5. Tooling & Clone
  if (await confirm('Initialize tools and clone repository?')) {
    if (!useContainer) {
      spawnSync(sshCmd, [remoteHost, `sudo npm install -g tsx vitest`], { shell: true, stdio: 'inherit' });
    }

    console.log(`🚀 Cloning fork ${userFork} on worker...`);
    const repoUrl = `https://github.com/${userFork}.git`;
    
    // Wipe existing dir for a clean clone and use absolute paths
    const cloneCmd = `rm -rf ${remoteWorkDir} && git clone --filter=blob:none ${repoUrl} ${remoteWorkDir} && cd ${remoteWorkDir} && git remote add upstream https://github.com/${upstreamRepo}.git && git fetch upstream`;
    spawnSync(sshCmd, [remoteHost, cloneCmd], { shell: true, stdio: 'inherit' });
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
