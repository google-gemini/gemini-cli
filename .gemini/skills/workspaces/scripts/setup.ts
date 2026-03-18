import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { ProviderFactory } from './providers/ProviderFactory.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

async function prompt(question: string, defaultValue: string, explanation?: string): Promise<string> {
  const autoAccept = process.argv.includes('--yes') || process.argv.includes('-y');
  if (autoAccept && defaultValue) return defaultValue;

  if (explanation) {
      console.log(`\n📖 ${explanation}`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`❓ ${question} (default: ${defaultValue}, <Enter> to use default): `, (answer) => {
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

  // 1. Project Identity
  const defaultProject = env.GOOGLE_CLOUD_PROJECT || env.WORKSPACE_PROJECT || '';
  const projectId = await prompt('GCP Project ID', defaultProject, 
    'The GCP Project where your workspace worker will live. Your personal project is recommended.');
  
  if (!projectId) {
      console.error('❌ Project ID is required. Set GOOGLE_CLOUD_PROJECT or enter it manually.');
      return 1;
  }

  const zone = await prompt('Compute Zone', env.WORKSPACE_ZONE || 'us-west1-a', 
    'The physical location of your worker. us-west1-a is the team default.');

  const terminalTarget = await prompt('Terminal UI Target (foreground, background, tab, window)', env.WORKSPACE_TERM_TARGET || 'tab',
    'When you start a job in gemini-cli, should it run as a foreground shell, background shell (no attach), new iterm2 tab, or new iterm2 window?');

  // 2. Repository Discovery (Dynamic)
  console.log('\n🔍 Detecting repository origins...');
  
  const repoInfoRes = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner,parent,isFork'], { stdio: 'pipe' });
  let upstreamRepo = 'google-gemini/gemini-cli'; 
  let userFork = '';

  if (repoInfoRes.status === 0) {
      try {
          const repoInfo = JSON.parse(repoInfoRes.stdout.toString());
          upstreamRepo = repoInfo.isFork && repoInfo.parent ? repoInfo.parent.nameWithOwner : repoInfo.nameWithOwner;
          
          console.log(`   - Upstream identified: ${upstreamRepo}`);
          console.log(`   - Searching for your forks of ${upstreamRepo}...`);
          
          const upstreamOwner = upstreamRepo.split('/')[0];
          const upstreamName = upstreamRepo.split('/')[1];

          // Use GraphQL to find your forks specifically. This is much faster than REST pagination.
          const gqlQuery = `query { 
            viewer { 
              repositories(first: 100, isFork: true, affiliations: OWNER) { 
                nodes { 
                  nameWithOwner 
                  parent { nameWithOwner } 
                } 
              } 
            } 
          }`;
          
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
              const shouldFork = await confirm(`❓ No fork detected. Create a personal fork for sandboxed implementations?`);
              userFork = shouldFork ? await createFork(upstreamRepo) : upstreamRepo;
          }
      } catch (e) {
          userFork = upstreamRepo;
      }
  }
  
  console.log(`   ✅ Upstream:    ${upstreamRepo}`);
  console.log(`   ✅ Workspace:   ${userFork}`);

  // 3. Security & Auth
  let githubToken = env.WORKSPACE_GH_TOKEN || '';
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
      console.log('   ✅ Using GitHub token from environment (WORKSPACE_GH_TOKEN).');
  }

  // 4. Save Confirmed State
  const targetVM = `gcli-workspace-${env.USER || 'mattkorwel'}`;
  const settingsPath = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');
  if (!fs.existsSync(path.dirname(settingsPath))) fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  
  const settings = {
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
    const shouldProvision = await confirm(`❓ Worker ${targetVM} not found. Provision it now?`);
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

  const persistentScripts = `~/.workspaces/scripts`;

  console.log(`\n📦 Synchronizing Logic & Credentials...`);
  await provider.exec(`mkdir -p ~/dev/main ~/.gemini/policies ~/.workspaces/scripts`);
  await provider.sync('.gemini/skills/workspaces/scripts/', `${persistentScripts}/`, { delete: true });
  await provider.sync('.gemini/skills/workspaces/policy.toml', `~/.gemini/policies/workspace-policy.toml`);

  if (fs.existsSync(path.join(env.HOME || '', '.gemini/google_accounts.json'))) {
    await provider.sync(path.join(env.HOME || '', '.gemini/google_accounts.json'), `~/.gemini/google_accounts.json`);
  }

  if (githubToken) {
    await provider.exec(`mkdir -p ~/.workspaces && echo ${githubToken} > ~/.workspaces/.gh_token && chmod 600 ~/.workspaces/.gh_token`);
  }

  // Initialize Remote Gemini Config with Auth
  console.log('⚙️  Initializing remote Gemini configuration...');
  const remoteConfigDir = `~/.workspaces/gemini-cli-config/.gemini`;
  await provider.exec(`mkdir -p ${remoteConfigDir}`);
  
  // Create a minimal settings.json on the remote to enable auth
  const remoteSettings = {
    general: {
      authMethod: 'google_accounts'
    }
  };
  const tmpSettingsPath = path.join(os.tmpdir(), `remote-settings-${Date.now()}.json`);
  fs.writeFileSync(tmpSettingsPath, JSON.stringify(remoteSettings, null, 2));
  await provider.sync(tmpSettingsPath, `${remoteConfigDir}/settings.json`);
  fs.unlinkSync(tmpSettingsPath);

  // Final Repo Sync
  console.log(`🚀 Finalizing Remote Repository (${userFork})...`);
  const repoUrl = `https://github.com/${userFork}.git`;
  const cloneCmd = `rm -rf ~/dev/main && git clone --filter=blob:none ${repoUrl} ~/dev/main && cd ~/dev/main && git remote add upstream https://github.com/${upstreamRepo}.git && git fetch upstream`;
  await provider.exec(cloneCmd);

  console.log('\n✨ ALL SYSTEMS GO! Your Gemini Workspace is ready.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch(console.error);
}
