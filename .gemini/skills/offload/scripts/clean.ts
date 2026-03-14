/**
 * Universal Offload Cleanup (Local)
 * 
 * Cleans up tmux sessions and workspace on the GCE worker.
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

export async function runCleanup() {
  const settingsPath = path.join(REPO_ROOT, '.gemini/settings.json');
  if (!fs.existsSync(settingsPath)) {
    console.error('❌ Settings not found. Run "npm run offload:setup" first.');
    return 1;
  }

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.maintainer?.deepReview;

  if (!config) {
    console.error('❌ Offload configuration not found.');
    return 1;
  }

  const { projectId, zone } = config;
  const targetVM = `gcli-offload-${process.env.USER || 'mattkorwel'}`;

  console.log(`🧹 Starting cleanup for ${targetVM}...`);

  // 1. Standard Cleanup
  console.log('   - Killing remote tmux sessions...');
  spawnSync(`ssh ${remoteHost} "tmux kill-server"`, { shell: true });

  console.log('   - Cleaning up Git Worktrees...');
  spawnSync(`ssh ${remoteHost} "cd ~/dev/main && git worktree prune"`, { shell: true });
  spawnSync(`ssh ${remoteHost} "rm -rf ~/dev/worktrees/*"`, { shell: true });

  console.log('✅ Remote environment cleared.');

  // 2. Full Wipe Option
  const shouldWipe = await confirm('\nWould you like to COMPLETELY wipe the remote workspace directory?');
  
  if (shouldWipe) {
    console.log(`🔥 Wiping ~/.offload/workspace...`);
    spawnSync(`gcloud compute ssh ${targetVM} --project ${projectId} --zone ${zone} --command "rm -rf ~/.offload/workspace && mkdir -p ~/.offload/workspace"`, { stdio: 'inherit', shell: true });
    console.log('✅ Remote workspace wiped.');
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCleanup().catch(console.error);
}
