import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

import readline from 'readline';
import { ProviderFactory } from './providers/ProviderFactory.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.cwd();

/**
 * Loads and parses a local .env file from the repository root and the home directory.
 */
function loadDotEnv() {
  const envPaths = [
    path.join(REPO_ROOT, '.env'),
    path.join(os.homedir(), '.env')
  ];

  envPaths.forEach(envPath => {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const val = match[2].trim().replace(/^["'](.*)["']$/, '$1');
          if (!process.env[key]) process.env[key] = val;
        }
      });
    }
  });
}

async function prompt(question: string, defaultValue: string, explanation?: string, sensitive: boolean = false): Promise<string> {
  const autoAccept = process.argv.includes('--yes') || process.argv.includes('-y');
  if (autoAccept && defaultValue) return defaultValue;

  if (explanation) {
      console.log(`\n📖 ${explanation}`);
  }

  const displayDefault = sensitive && defaultValue ? `${defaultValue.substring(0, 4)}...${defaultValue.substring(defaultValue.length - 4)}` : defaultValue;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  const promptMsg = defaultValue 
    ? `❓ ${question} [Detected: ${displayDefault}] (Press <Enter> to keep, or type new value): `
    : `❓ ${question} (<Enter> for none): `;

  return new Promise((resolve) => {
    rl.question(promptMsg, (answer) => {
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
    rl.question(`❓ ${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

async function createFork(upstream: string): Promise<string> {
    console.log(`   - Creating fork for ${upstream}...`);
    const forkRes = spawnSync('gh', ['repo', 'fork', upstream, '--clone=false'], { stdio: 'inherit' });
    if (forkRes.status === 0) {
        const userRes = spawnSync('gh', ['api', 'user', '-q', '.login'], { stdio: 'pipe' });
        const user = userRes.stdout.toString().trim();
        return `${user}/${upstream.split('/')[1]}`;
    }
    return upstream;
}

export async function runSetup(env: NodeJS.ProcessEnv = process.env) {
  loadDotEnv();
  
  console.log(`
================================================================================
🚀 GEMINI WORKSPACES: HIGH-PERFORMANCE REMOTE DEVELOPMENT
================================================================================
Workspaces allow you to delegate heavy tasks (PR reviews, agentic fixes,
and full builds) to a dedicated, high-performance GCP worker.
================================================================================
  `);

  console.log('📝 PHASE 1: CONFIGURATION');
  console.log('--------------------------------------------------------------------------------');

  const settingsPath = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');
  let settings: any = {};
  let skipConfig = false;

  if (fs.existsSync(settingsPath)) {
      try {
          settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          if (settings.workspace && !process.argv.includes('--reconfigure')) {
              console.log('   ✅ Existing configuration found.');
              const shouldSkip = await confirm('Use existing configuration and skip to execution?');
              if (shouldSkip) {
                  skipConfig = true;
              }
          }
      } catch (e) {}
  }

  // 1. Project Identity
  let projectId = settings.workspace?.projectId || '';
  let zone = settings.workspace?.zone || 'us-west1-a';
  let terminalTarget = settings.workspace?.terminalTarget || 'tab';
  let upstreamRepo = settings.workspace?.upstreamRepo || 'google-gemini/gemini-cli';
  let userFork = settings.workspace?.userFork || upstreamRepo;

  if (!skipConfig) {
      const defaultProject = env.GOOGLE_CLOUD_PROJECT || env.WORKSPACE_PROJECT || projectId || '';
      projectId = await prompt('GCP Project ID', defaultProject, 
        'The GCP Project where your workspace worker will live. Your personal project is recommended.');
      
      if (!projectId) {
          console.error('❌ Project ID is required. Set GOOGLE_CLOUD_PROJECT or enter it manually.');
          return 1;
      }

      zone = await prompt('Compute Zone', env.WORKSPACE_ZONE || zone, 
        'The physical location of your worker. us-west1-a is the team default.');

      terminalTarget = await prompt('Terminal UI Target (foreground, background, tab, window)', env.WORKSPACE_TERM_TARGET || terminalTarget,
        'When you start a job in gemini-cli, should it run as a foreground shell, background shell (no attach), new iterm2 tab, or new iterm2 window?');

      // 2. Repository Discovery (Dynamic)
      console.log('\n🔍 Detecting repository origins...');
      
      const repoInfoRes = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner,parent,isFork'], { stdio: 'pipe' });

      if (repoInfoRes.status === 0) {
          try {
              const repoInfo = JSON.parse(repoInfoRes.stdout.toString());
              upstreamRepo = repoInfo.isFork && repoInfo.parent ? repoInfo.parent.nameWithOwner : repoInfo.nameWithOwner;
              
              console.log(`   - Upstream identified: ${upstreamRepo}`);
              console.log(`   - Searching for your forks of ${upstreamRepo}...`);
              
              const upstreamOwner = upstreamRepo.split('/')[0];
              const upstreamName = upstreamRepo.split('/')[1];

              const gqlQuery = `query { viewer { repositories(first: 100, isFork: true, affiliations: OWNER) { nodes { nameWithOwner parent { nameWithOwner } } } } }`;
              const forksRes = spawnSync('gh', ['api', 'graphql', '-f', `query=${gqlQuery}`, '--jq', `.data.viewer.repositories.nodes[] | select(.parent.nameWithOwner == "${upstreamRepo}") | .nameWithOwner`], { stdio: 'pipe' });
              const myForks = forksRes.stdout.toString().trim().split('\n').filter(Boolean);

              if (myForks.length > 0) {
                  console.log('\n🍴 Found existing forks:');
                  myForks.forEach((name: string, i: number) => console.log(`   [${i + 1}] ${name}`));
                  console.log(`   [c] Create a new fork`);
                  console.log(`   [u] Use upstream directly (not recommended)`);

                  const choice = await prompt('Select an option', '1');
                  if (choice.toLowerCase() === 'c') {
                      userFork = await createFork(upstreamRepo);
                  } else if (choice.toLowerCase() === 'u') {
                      userFork = upstreamRepo;
                  } else {
                      const idx = parseInt(choice) - 1;
                      userFork = myForks[idx] || myForks[0];
                  }
              } else {
                  const shouldFork = await confirm('No fork detected. Create a personal fork for sandboxed implementations?');
                  userFork = shouldFork ? await createFork(upstreamRepo) : upstreamRepo;
              }
          } catch (e) {
              userFork = upstreamRepo;
          }
      }
      
      console.log(`   ✅ Upstream:    ${upstreamRepo}`);
      console.log(`   ✅ Workspace:   ${userFork}`);
  }

  // 3. Security & Auth (Always check for token if init is needed)
  let githubToken = env.WORKSPACE_GH_TOKEN || '';
  if (!skipConfig) {
      if (!githubToken) {
          const hasToken = await confirm('\nDo you already have a GitHub Personal Access Token (PAT) with "Read/Write" access to contents & PRs?');
          if (hasToken) {
              githubToken = await prompt('Paste Scoped Token', '');
          } else {
              const shouldGenToken = await confirm('Would you like to generate a new scoped token now? (Highly Recommended)');
              if (shouldGenToken) {
                  const baseUrl = 'https://github.com/settings/personal-access-tokens/new';
                  const name = `Workspace-${env.USER}`;
                  const repoParams = userFork !== upstreamRepo 
                      ? `&repositories[]=${encodeURIComponent(upstreamRepo)}&repositories[]=${encodeURIComponent(userFork)}`
                      : `&repositories[]=${encodeURIComponent(upstreamRepo)}`;

                  const magicLink = `${baseUrl}?name=${encodeURIComponent(name)}&description=Gemini+Workspaces+Worker${repoParams}&contents=write&pull_requests=write&metadata=read`;
                  const terminalLink = `\u001b]8;;${magicLink}\u0007${magicLink}\u001b]8;;\u0007`;

                  console.log(`\n🔐 ACTION REQUIRED: Create a token with the required permissions:`);
                  console.log(`\n${terminalLink}\n`);
                  
                  githubToken = await prompt('Paste Scoped Token', '');
              }
          }
      } else {
          githubToken = await prompt('GitHub Token', githubToken, 'A GitHub PAT is required for remote repository access and PR operations.', true);
      }
  }

  // 4. Gemini API Auth Strategy
  console.log('\n🔐 Detecting Gemini Authentication strategy...');
  const localSettingsPath = path.join(env.HOME || '', '.gemini/settings.json');
  let authStrategy = 'google_accounts';
  let geminiApiKey = env.WORKSPACE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';

  if (fs.existsSync(localSettingsPath)) {
      try {
          const localSettings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf8'));
          authStrategy = localSettings.security?.auth?.selectedType || 'google_accounts';
          if (!geminiApiKey && localSettings.security?.auth?.apiKey) {
              geminiApiKey = localSettings.security.auth.apiKey;
          }
          console.log(`   - Local Auth Method: ${authStrategy}`);
      } catch (e) {}
  }

  if (authStrategy === 'gemini-api-key') {
      if (geminiApiKey) {
          console.log('\n🔐 Found Gemini API Key in environment or settings.');
          geminiApiKey = await prompt('Gemini API Key', geminiApiKey, 'Enter to use? Or paste a new one', true);
      } else {
          console.log('\n📖 In API Key mode, the remote worker needs your Gemini API Key to authenticate.');
          geminiApiKey = await prompt('Gemini API Key', '', 'Paste your Gemini API Key', true);
      }
  } else {
      console.log(`   - Using current auth strategy: ${authStrategy}`);
  }

  // 5. Save Confirmed State
  const targetVM = `gcli-workspace-${env.USER || 'mattkorwel'}`;
  if (!fs.existsSync(path.dirname(settingsPath))) fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  
  settings = {
      workspace: { 
          projectId, zone, terminalTarget, 
          userFork, upstreamRepo,
          remoteHost: 'gcli-worker',
          remoteWorkDir: '~/dev/main',
          useContainer: true
      }
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(`\n✅ Configuration saved to ${settingsPath}`);

  // Transition to Execution
  const provider = ProviderFactory.getProvider({ projectId, zone, instanceName: targetVM });

  console.log('\n🏗️  PHASE 2: INFRASTRUCTURE');
  console.log('--------------------------------------------------------------------------------');
  console.log(`   - Verifying access and finding worker ${targetVM}...`);
  let status = await provider.getStatus();
  
  if (status.status === 'UNKNOWN' || status.status === 'ERROR') {
    const shouldProvision = await confirm(`Worker ${targetVM} not found. Provision it now?`);
    if (!shouldProvision) return 1;
    
    const provisionRes = await provider.provision();
    if (provisionRes !== 0) return 1;
    status = await provider.getStatus();
  }

  if (status.status !== 'RUNNING') {
    console.log('   - Waking up worker...');
    await provider.ensureReady();
  }

  console.log('\n🚀 PHASE 3: REMOTE INITIALIZATION');
  console.log('--------------------------------------------------------------------------------');
  const setupRes = await provider.setup({ projectId, zone, dnsSuffix: '.internal.gcpnode.com' });
  if (setupRes !== 0) return setupRes;

  // Use the unified path to ensure host and container match perfectly
  const workspaceRoot = `/home/node/.workspaces`;
  
  const persistentScripts = `${workspaceRoot}/scripts`;
  const remoteConfigDir = `${workspaceRoot}/gemini-cli-config/.gemini`;

  console.log(`\n📦 Synchronizing Logic & Credentials...`);
  // Ensure the directory structure exists on the host
  await provider.exec(`sudo mkdir -p ${workspaceRoot}/main ${workspaceRoot}/worktrees ${workspaceRoot}/policies ${workspaceRoot}/scripts ${remoteConfigDir}`);
  await provider.exec(`sudo chown -R 1000:1000 ${workspaceRoot}`);
  await provider.exec(`sudo chmod -R 777 ${workspaceRoot}`);
  
  // 1. Sync Scripts & Policies
  await provider.sync('extensions/workspaces/scripts/', `${persistentScripts}/`, { delete: true, sudo: true });
  await provider.sync('policies/workspaces/workspace-policy.toml', `${workspaceRoot}/policies/workspace-policy.toml`, { sudo: true });

  // 2. Initialize Remote Gemini Config with Auth
  console.log('⚙️  Initializing remote Gemini configuration...');
  
  // NEW: Sync local theme and UI preferences
  let localTheme = 'Shades Of Purple';
  let useAlternateBuffer = true;
  let useBackgroundColor = true;

  if (fs.existsSync(localSettingsPath)) {
      try {
          const localSettings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf8'));
          localTheme = localSettings.ui?.theme || localTheme;
          useAlternateBuffer = localSettings.ui?.useAlternateBuffer ?? useAlternateBuffer;
          useBackgroundColor = localSettings.ui?.useBackgroundColor ?? useBackgroundColor;
      } catch (e) {}
  }

  const remoteSettings: any = {
    security: {
      auth: {
        selectedType: authStrategy
      },
      folderTrust: {
        enabled: false
      }
    },
    ui: {
      theme: localTheme,
      useAlternateBuffer,
      useBackgroundColor,
    },
    general: {
      enableAutoUpdate: false
    }
  };
  
  if (authStrategy === 'gemini-api-key' && geminiApiKey) {
      remoteSettings.security.auth.apiKey = geminiApiKey;
      console.log('   ✅ Configuring remote for API Key authentication.');
  }

  const tmpSettingsPath = path.join(os.tmpdir(), `remote-settings-${Date.now()}.json`);
  fs.writeFileSync(tmpSettingsPath, JSON.stringify(remoteSettings, null, 2));
  
  // Ensure the remote config dir exists before syncing
  await provider.exec(`sudo mkdir -p ${remoteConfigDir} && sudo chmod 777 ${remoteConfigDir}`);
  await provider.sync(tmpSettingsPath, `${remoteConfigDir}/settings.json`, { sudo: true });
  fs.unlinkSync(tmpSettingsPath);

  // 3. Sync credentials for Google Accounts if needed
  if (authStrategy === 'google_accounts' || authStrategy === 'oauth-personal') {
      if (fs.existsSync(path.join(env.HOME || '', '.gemini/google_accounts.json'))) {
        await provider.sync(path.join(env.HOME || '', '.gemini/google_accounts.json'), `${remoteConfigDir}/google_accounts.json`, { sudo: true });
        console.log('   ✅ Synchronized Google Accounts credentials.');
      }
  }

  if (githubToken) {
    await provider.exec(`echo ${githubToken} | sudo tee ${workspaceRoot}/.gh_token > /dev/null && sudo chmod 600 ${workspaceRoot}/.gh_token`);
    // Authenticate GH CLI on host
    await provider.exec(`sudo -u $(whoami) gh auth login --with-token < ${workspaceRoot}/.gh_token`);
    console.log('   ✅ Authenticated GitHub CLI on host.');
  }

  // Final Repo Sync
  console.log(`🚀 Finalizing Remote Repository (${userFork})...`);
  const repoUrl = `https://github.com/${userFork}.git`;
  const cloneCmd = `sudo rm -rf ${workspaceRoot}/main && sudo git clone --quiet --filter=blob:none ${repoUrl} ${workspaceRoot}/main && sudo git -C ${workspaceRoot}/main remote add upstream https://github.com/${upstreamRepo}.git && sudo git -C ${workspaceRoot}/main fetch --quiet upstream && sudo chown -R 1000:1000 ${workspaceRoot}`;
  await provider.exec(cloneCmd);

  console.log('\n✨ ALL SYSTEMS GO! Your Gemini Workspace is ready.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch(console.error);
}
