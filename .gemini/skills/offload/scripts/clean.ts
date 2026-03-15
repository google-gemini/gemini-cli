/**
 * Universal Offload Cleanup (Local)
 * 
 * Surgical or full cleanup of sessions and worktrees on the GCE worker.
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

export async function runCleanup(args: string[]) {
  const prNumber = args[0];
  const action = args[1];

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

  const { remoteHost } = config;

  if (prNumber && action) {
    const sessionName = `offload-${prNumber}-${action}`;
    const worktreePath = `~/dev/worktrees/${sessionName}`;
    
    console.log(`🧹 Surgically removing session and worktree for ${prNumber}-${action}...`);
    
    // Kill specific tmux session
    spawnSync(`ssh ${remoteHost} "tmux kill-session -t ${sessionName} 2>/dev/null"`, { shell: true });
    
    // Remove specific worktree
    spawnSync(`ssh ${remoteHost} "cd ~/dev/main && git worktree remove -f ${worktreePath} 2>/dev/null"`, { shell: true });
    spawnSync(`ssh ${remoteHost} "cd ~/dev/main && git worktree prune"`, { shell: true });
    
    console.log(`✅ Cleaned up ${prNumber}-${action}.`);
    return 0;
  }

  // --- Bulk Cleanup (Old Behavior) ---
  console.log(`🧹 Starting BULK cleanup on ${remoteHost}...`);

  // 1. Standard Cleanup
  console.log('   - Killing ALL remote tmux sessions...');
  spawnSync(`ssh ${remoteHost} "tmux kill-server"`, { shell: true });

  console.log('   - Cleaning up ALL Git Worktrees...');
  spawnSync(`ssh ${remoteHost} "cd ~/dev/main && git worktree prune"`, { shell: true });
  spawnSync(`ssh ${remoteHost} "rm -rf ~/dev/worktrees/*"`, { shell: true });

  console.log('✅ Remote environment cleared.');

  // 2. Full Wipe Option
  const shouldWipe = await confirm('\nWould you like to COMPLETELY wipe the remote workspace (main clone)?');
  
  if (shouldWipe) {
    console.log(`🔥 Wiping ~/dev/main...`);
    spawnSync(`ssh ${remoteHost} "rm -rf ~/dev/main && mkdir -p ~/dev/main"`, { stdio: 'inherit', shell: true });
    console.log('✅ Remote hub wiped. You will need to run npm run offload:setup again.');
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCleanup(process.argv.slice(2)).catch(console.error);
}
