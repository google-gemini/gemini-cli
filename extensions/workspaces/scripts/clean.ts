/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import fs from 'node:fs';

import readline from 'node:readline';
import { ProviderFactory } from './providers/ProviderFactory.ts';


const REPO_ROOT = process.cwd();

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function runCleanup(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const prNumber = args[0];
  const action = args[1];

  const settingsPath = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');
  if (!fs.existsSync(settingsPath)) {
    console.error('❌ Settings not found. Run "workspace setup" first.');
    return 1;
  }

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.workspace;
  if (!config) {
    console.error('❌ Workspace configuration not found.');
    return 1;
  }

  const { projectId, zone } = config;
  const targetVM = `gcli-workspace-${env.USER || 'mattkorwel'}`;
  const provider = ProviderFactory.getProvider({
    projectId,
    zone,
    instanceName: targetVM,
  });

  if (prNumber && action) {
    const sessionName = `workspace-${prNumber}-${action}`;
    const worktreePath = `/home/node/.workspaces/worktrees/${sessionName}`;

    console.log(
      `🧹 Surgically removing session and worktree for ${prNumber}-${action}...`,
    );

    // Kill specific tmux session inside container
    await provider.exec(`tmux kill-session -t ${sessionName} 2>/dev/null`, {
      wrapContainer: 'maintainer-worker',
    });

    // Remove specific worktree inside container
    await provider.exec(
      `cd /home/node/.workspaces/main && git worktree remove -f ${worktreePath} 2>/dev/null && git worktree prune`,
      { wrapContainer: 'maintainer-worker' },
    );

    console.log(`✅ Cleaned up ${prNumber}-${action}.`);
    return 0;
  }

  // --- Bulk Cleanup ---
  console.log(
    `⚠️  DANGER: You are about to perform a BULK cleanup on ${targetVM}.`,
  );
  const confirmed = await confirm(
    '   Are you sure you want to kill ALL sessions and worktrees?',
  );
  if (!confirmed) {
    console.log('❌ Cleanup cancelled.');
    return 0;
  }

  console.log(`🧹 Starting BULK cleanup...`);

  // 1. Standard Cleanup
  console.log('   - Killing ALL remote tmux sessions...');
  await provider.exec(`tmux kill-server`, {
    wrapContainer: 'maintainer-worker',
  });

  console.log('   - Cleaning up Docker resources...');
  await provider.exec(`sudo docker rm -f maintainer-worker || true`);
  await provider.exec(`sudo docker system prune -af --volumes`);

  console.log('   - Cleaning up ALL Git Worktrees...');
  await provider.exec(
    `cd /home/node/.workspaces/main && git worktree prune && rm -rf /home/node/.workspaces/worktrees/*`,
    { wrapContainer: 'maintainer-worker' },
  );

  console.log('✅ Remote environment cleared.');

  // 2. Full Wipe Option
  const shouldWipe = await confirm(
    '\nWould you like to COMPLETELY wipe the remote workspace (main clone)?',
  );

  if (shouldWipe) {
    console.log(`🔥 Wiping /home/node/.workspaces/main...`);
    await provider.exec(
      `rm -rf /home/node/.workspaces/main && mkdir -p /home/node/.workspaces/main`,
      { wrapContainer: 'maintainer-worker' },
    );
    console.log(
      '✅ Remote hub wiped. You will need to run workspace setup again.',
    );
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCleanup(process.argv.slice(2)).catch(console.error);
}
