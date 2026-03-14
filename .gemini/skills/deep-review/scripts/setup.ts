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

async function main() {
  console.log('\n🌟 Initializing Deep Review Skill Settings...');
  
  const remoteHost = await prompt('Remote SSH Host', 'cli');
  const remoteWorkDir = await prompt('Remote Work Directory', '~/gcli/deepreview');

  console.log(`🔍 Checking state of ${remoteHost}...`);
  const ghCheck = spawnSync('ssh', [remoteHost, 'command -v gh'], { shell: true });

  if (ghCheck.status !== 0) {
    console.log('\n📥 System Requirements Check:');
    console.log('  ❌ GitHub CLI (gh) is not installed on remote.');
    
    const shouldProvision = await confirm('\nWould you like Gemini to automatically provision gh?');
    
    if (shouldProvision) {
      console.log(`🚀 Attempting to install gh on ${remoteHost}...`);
      const osCheck = spawnSync('ssh', [remoteHost, 'uname -s'], { shell: true });
      const os = osCheck.stdout.toString().trim();
      let installCmd = os === 'Linux' ? 'sudo apt update && sudo apt install -y gh' : (os === 'Darwin' ? 'brew install gh' : '');
      if (installCmd) {
        spawnSync('ssh', ['-t', remoteHost, installCmd], { stdio: 'inherit', shell: true });
      }
    } else {
      console.log('⚠️  Please ensure gh is installed before running again.');
      process.exit(1);
    }
  }

  // Ensure remote work dir exists
  spawnSync('ssh', [remoteHost, `mkdir -p ${remoteWorkDir}`], { shell: true });

  // Identity Synchronization Onboarding
  console.log('\n🔐 Identity & Authentication:');
  const homeDir = process.env.HOME || '';
  const localAuth = path.join(homeDir, '.gemini/google_accounts.json');
  const localEnv = path.join(REPO_ROOT, '.env');
  const hasAuth = fs.existsSync(localAuth);
  const hasEnv = fs.existsSync(localEnv);

  let syncAuth = false;
  if (hasAuth || hasEnv) {
    console.log(`  🔍 Found local identity files: ${[hasAuth ? 'Google Account' : '', hasEnv ? '.env' : ''].filter(Boolean).join(', ')}`);
    syncAuth = await confirm('  Would you like Gemini to automatically sync your local identity to the remote workstation for seamless authentication?');
  }

  const terminalType = await prompt('\nTerminal Automation (iterm2 / terminal / none)', 'iterm2');

  // Local Dependencies Install (Isolated)
  const envLoader = 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"; [ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion"';
  
  console.log(`\n📦 Checking isolated dependencies in ${remoteWorkDir}...`);
  const depCheck = spawnSync('ssh', [remoteHost, `${envLoader} && [ -f ${remoteWorkDir}/node_modules/.bin/tsx ] && [ -f ${remoteWorkDir}/node_modules/.bin/gemini ]`], { shell: true });

  if (depCheck.status !== 0) {
    console.log(`📦 Installing isolated dependencies (nightly CLI & tsx) in ${remoteWorkDir}...`);
    // Note: we create a package.json first to prevent npm from walking up the tree looking for one if it doesn't exist
    const installCmd = `${envLoader} && mkdir -p ${remoteWorkDir} && cd ${remoteWorkDir} && [ -f package.json ] || npm init -y > /dev/null && npm install tsx @google/gemini-cli@nightly`;
    spawnSync('ssh', [remoteHost, q(installCmd)], { stdio: 'inherit', shell: true });
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
  settings.maintainer.deepReview = { remoteHost, remoteWorkDir, terminalType, syncAuth };
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log('\n✅ Onboarding complete! Settings saved to .gemini/settings.json');
}

main().catch(console.error);
