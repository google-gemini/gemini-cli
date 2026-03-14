/**
 * Universal Deep Review Onboarding (Local)
 */
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const q = (str: string) => `'${str.replace(/'/g, "'\\''")}'`;

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
  console.log('\n🌟 Initializing Offload Skill Settings...');

  const OFFLOAD_BASE = '~/.offload';
  const remoteHost = await prompt('Remote SSH Host', 'cli');
  const remoteWorkDir = await prompt('Remote Work Directory', `${OFFLOAD_BASE}/workspace`);

  console.log(`🔍 Checking state of ${remoteHost}...`);
  const envLoader = 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"';
  
  // Probe remote for existing installations
  const ghCheck = spawnSync('ssh', [remoteHost, 'sh -lc "command -v gh"'], { stdio: 'pipe' });
  const tmuxCheck = spawnSync('ssh', [remoteHost, 'sh -lc "command -v tmux"'], { stdio: 'pipe' });
  const geminiCheck = spawnSync('ssh', [remoteHost, `sh -lc "${envLoader} && command -v gemini"`], { stdio: 'pipe' });

  const hasGH = ghCheck.status === 0;
  const hasTmux = tmuxCheck.status === 0;
  const hasGemini = geminiCheck.status === 0;

  // 1. Gemini CLI Isolation Choice
  let geminiSetup = 'isolated';
  if (hasGemini) {
    const geminiChoice = await prompt(`\nGemini CLI found on remote. Use [p]re-existing instance or [i]solated sandbox instance? (Isolated is recommended)`, 'i');
    geminiSetup = geminiChoice.toLowerCase() === 'p' ? 'preexisting' : 'isolated';
  } else {
    console.log('\n💡 Gemini CLI not found on remote. Defaulting to isolated sandbox instance.');
  }

  // 2. GitHub CLI Isolation Choice
  let ghSetup = 'isolated';
  if (hasGH) {
    const ghChoice = await prompt(`GitHub CLI found on remote. Use [p]re-existing instance or [i]solated sandbox instance? (Isolated is recommended)`, 'i');
    ghSetup = ghChoice.toLowerCase() === 'p' ? 'preexisting' : 'isolated';
  } else {
    console.log('💡 GitHub CLI not found on remote. Defaulting to isolated sandbox instance.');
  }

  const ISOLATED_GEMINI_CONFIG = `${OFFLOAD_BASE}/gemini-cli-config`;
  const ISOLATED_GH_CONFIG = `${OFFLOAD_BASE}/gh-cli-config`;

  if (!hasGH || !hasTmux) {
    console.log('\n📥 System Requirements Check:');
    if (!hasGH) console.log('  ❌ GitHub CLI (gh) is not installed on remote.');
    if (!hasTmux) console.log('  ❌ tmux is not installed on remote.');
    
    const shouldProvision = await confirm('\nWould you like Gemini to automatically provision missing requirements?');
    if (shouldProvision) {
      console.log(`🚀 Attempting to provision dependencies on ${remoteHost}...`);
      const osCheck = spawnSync('ssh', [remoteHost, 'uname -s'], { stdio: 'pipe' });
      const os = osCheck.stdout.toString().trim();
      
      let installCmd = '';
      if (os === 'Linux') {
        installCmd = 'sudo apt update && sudo apt install -y ' + [!hasGH ? 'gh' : '', !hasTmux ? 'tmux' : ''].filter(Boolean).join(' ');
      } else if (os === 'Darwin') {
        installCmd = 'brew install ' + [!hasGH ? 'gh' : '', !hasTmux ? 'tmux' : ''].filter(Boolean).join(' ');
      }

      if (installCmd) {
        spawnSync('ssh', ['-t', remoteHost, installCmd], { stdio: 'inherit' });
      }
    } else {
      console.log('⚠️  Please ensure gh and tmux are installed before running again.');
      return 1;
    }
  }

  // Ensure remote work dir and isolated config dirs exist
  spawnSync('ssh', [remoteHost, `mkdir -p ${remoteWorkDir} ${ISOLATED_GEMINI_CONFIG}/policies/ ${ISOLATED_GH_CONFIG}`], { stdio: 'pipe' });
  // Identity Synchronization Onboarding
  console.log('\n🔐 Identity & Authentication:');
  
  // GH Auth Check
  const ghAuthCmd = ghSetup === 'isolated' ? `export GH_CONFIG_DIR=${ISOLATED_GH_CONFIG} && gh auth status` : 'gh auth status';
  const remoteGHAuth = spawnSync('ssh', [remoteHost, `sh -lc "${ghAuthCmd}"`], { stdio: 'pipe' });
  const isGHAuthRemote = remoteGHAuth.status === 0;
  
  if (isGHAuthRemote) {
    console.log(`  ✅ GitHub CLI is already authenticated on remote (${ghSetup}).`);
  } else {
    console.log(`  ❌ GitHub CLI is NOT authenticated on remote (${ghSetup}).`);
    // If it's isolated but global is authenticated, offer to sync
    if (ghSetup === 'isolated') {
        const globalGHAuth = spawnSync('ssh', [remoteHost, 'sh -lc "gh auth status"'], { stdio: 'pipe' });
        if (globalGHAuth.status === 0) {
            if (await confirm('     Global GH auth found. Sync it to isolated instance?')) {
                spawnSync('ssh', [remoteHost, `mkdir -p ${ISOLATED_GH_CONFIG} && cp -r ~/.config/gh/* ${ISOLATED_GH_CONFIG}/`]);
                const verifySync = spawnSync('ssh', [remoteHost, `sh -lc "export GH_CONFIG_DIR=${ISOLATED_GH_CONFIG} && gh auth status"`], { stdio: 'pipe' });
                if (verifySync.status === 0) {
                    console.log('     ✅ GitHub CLI successfully authenticated via sync.');
                    return; // Skip the "may need to login" message
                }
            }
        }
    }
    console.log('     ⚠️  GitHub CLI is not yet authenticated. You may need to run "gh auth login" on the remote machine later.');
  }

  // Gemini Auth Check
  const geminiAuthCheck = geminiSetup === 'isolated' 
    ? `[ -f ${ISOLATED_GEMINI_CONFIG}/google_accounts.json ]` 
    : '[ -f ~/.gemini/google_accounts.json ]';
  const remoteGeminiAuth = spawnSync('ssh', [remoteHost, `sh -lc "${geminiAuthCheck}"`], { stdio: 'pipe' });
  const isGeminiAuthRemote = remoteGeminiAuth.status === 0;

  let syncAuth = false;
  if (isGeminiAuthRemote) {
    console.log(`  ✅ Gemini CLI is already authenticated on remote (${geminiSetup}).`);
  } else {
    const homeDir = env.HOME || '';
    const localAuth = path.join(homeDir, '.gemini/google_accounts.json');
    const localEnv = path.join(REPO_ROOT, '.env');
    const hasAuth = fs.existsSync(localAuth);
    const hasEnv = fs.existsSync(localEnv);

    if (hasAuth || hasEnv) {
      console.log(`  🔍 Found local Gemini CLI credentials: ${[hasAuth ? 'Google Account' : '', hasEnv ? '.env' : ''].filter(Boolean).join(', ')}`);
      syncAuth = await confirm('  Would you like Gemini to automatically sync your local credentials to the remote workstation for seamless authentication?');
    }
  }

  const terminalType = await prompt('\nTerminal Automation (iterm2 / terminal / none)', 'iterm2');

  // Local Dependencies Install (Isolated)
  console.log(`\n📦 Checking isolated dependencies in ${remoteWorkDir}...`);
  const checkCmd = `ssh ${remoteHost} ${q(`${envLoader} && [ -x ${remoteWorkDir}/node_modules/.bin/tsx ] && [ -x ${remoteWorkDir}/node_modules/.bin/gemini ]`)}`;
  const depCheck = spawnSync(checkCmd, { shell: true });

  if (depCheck.status !== 0) {
    console.log(`📦 Installing isolated dependencies (nightly CLI & tsx) in ${remoteWorkDir}...`);
    const installCmd = `ssh ${remoteHost} ${q(`${envLoader} && mkdir -p ${remoteWorkDir} && cd ${remoteWorkDir} && [ -f package.json ] || npm init -y > /dev/null && npm install tsx @google/gemini-cli@nightly`)}`;
    spawnSync(installCmd, { stdio: 'inherit', shell: true });
  } else {
    console.log('✅ Isolated dependencies already present.');
  }

  // Save Settings
  const settingsPath = path.join(REPO_ROOT, '.gemini/settings.json');
  let settings: any = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
  }
  settings.maintainer = settings.maintainer || {};
  settings.maintainer.deepReview = { remoteHost, remoteWorkDir, terminalType, syncAuth, geminiSetup, ghSetup };
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log('\n✅ Onboarding complete! Settings saved to .gemini/settings.json');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch(console.error);
}
