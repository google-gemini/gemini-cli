/**
 * Universal Offload Onboarding (Local)
 * 
 * Configures the GCP Project and Fleet defaults.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
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
  console.log('\n🌟 Initializing GCE Offload Fleet Settings...');

  const projectId = await prompt('GCP Project ID', 'gemini-cli-team-quota');
  const zone = await prompt('Compute Zone', 'us-west1-a');
  const machineType = await prompt('Machine Type', 'n2-standard-8');

  console.log(`🔍 Verifying project access for ${projectId}...`);
  const projectCheck = spawnSync('gcloud', ['projects', 'describe', projectId], { stdio: 'pipe' });
  if (projectCheck.status !== 0) {
    console.error(`❌ Access denied to project: ${projectId}. Ensure you are logged in via gcloud.`);
    return 1;
  }

  // Identity Synchronization Onboarding
  console.log('\n🔐 Identity & Authentication:');
  const homeDir = env.HOME || '';
  const localAuth = path.join(homeDir, '.gemini/google_accounts.json');
  const hasAuth = fs.existsSync(localAuth);

  let syncAuth = false;
  if (hasAuth) {
    console.log(`  🔍 Found local Gemini CLI credentials.`);
    syncAuth = await confirm('  Would you like to automatically sync your local credentials to new fleet workers for seamless authentication?');
  }

  const terminalType = await prompt('\nTerminal Automation (iterm2 / terminal / none)', 'iterm2');

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
    machineType, 
    terminalType, 
    syncAuth,
    setupType: 'isolated',
    geminiSetup: 'isolated',
    ghSetup: 'isolated'
  };
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  
  console.log('\n✅ GCE Fleet Onboarding complete! Settings saved to .gemini/settings.json');
  console.log(`👉 Use 'npm run offload:fleet provision' to spin up your first worker.`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch(console.error);
}
