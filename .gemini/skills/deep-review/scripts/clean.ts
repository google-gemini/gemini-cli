/**
 * Universal Deep Review Cleanup (Local)
 */
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

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
  const settingsPath = path.join(REPO_ROOT, '.gemini/settings.json');
  if (!fs.existsSync(settingsPath)) {
    console.error('❌ Settings not found. Run "npm run review:setup" first.');
    process.exit(1);
  }

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.maintainer?.deepReview;

  if (!config) {
    console.error('❌ Deep Review configuration not found.');
    process.exit(1);
  }

  const { remoteHost, remoteWorkDir } = config;

  console.log(`🧹 Starting cleanup for ${remoteHost}:${remoteWorkDir}...`);

  // 1. Standard Cleanup
  console.log('   - Killing remote tmux sessions...');
  spawnSync('ssh', [remoteHost, 'tmux kill-server'], { shell: true });

  console.log('   - Removing PR directories...');
  // Find all directories in the work dir that aren't .gemini and delete them
  const dirCleanup = `find ${remoteWorkDir} -mindepth 1 -maxdepth 1 -type d ! -name ".gemini" -exec rm -rf {} +`;
  spawnSync('ssh', [remoteHost, dirCleanup], { shell: true });

  console.log('✅ Standard cleanup complete.');

  // 2. Full Wipe Option
  const shouldWipe = await confirm('\nWould you like to COMPLETELY remove the work directory from the remote machine?');
  
  if (shouldWipe) {
    console.log(`🔥 Wiping ${remoteWorkDir}...`);
    const wipeCmd = `rm -rf ${remoteWorkDir}`;
    spawnSync('ssh', [remoteHost, wipeCmd], { stdio: 'inherit', shell: true });
    console.log('✅ Remote directory wiped.');
  }
}

main().catch(console.error);
