/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import fs from 'node:fs';

import { ProviderFactory } from './providers/ProviderFactory.ts';


const REPO_ROOT = process.cwd();

async function runStatus(env: NodeJS.ProcessEnv = process.env) {
  const settingsPath = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');
  if (!fs.existsSync(settingsPath)) {
    console.error('❌ Settings not found. Run "workspace setup" first.');
    return 1;
  }
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.workspace;
  if (!config) {
    console.error('❌ Deep Review configuration not found.');
    return 1;
  }

  const { projectId, zone } = config;
  const targetVM = `gcli-workspace-${env.USER || 'mattkorwel'}`;
  const provider = ProviderFactory.getProvider({
    projectId,
    zone,
    instanceName: targetVM,
  });

  console.log(`\n🛰️  Workspace Mission Control: ${targetVM}`);
  console.log(
    `--------------------------------------------------------------------------------`,
  );

  const status = await provider.getStatus();
  console.log(`   - VM State:   ${status.status}`);
  console.log(`   - Internal IP: ${status.internalIp || 'N/A'}`);

  if (status.status === 'RUNNING') {
    console.log(`\n🧵 Active Sessions (tmux):`);
    // We fetch the list of sessions from INSIDE the container
    const tmuxRes = await provider.getExecOutput(
      'tmux list-sessions -F "#S" 2>/dev/null',
      { wrapContainer: 'maintainer-worker' },
    );

    if (tmuxRes.status === 0 && tmuxRes.stdout.trim()) {
      const sessions = tmuxRes.stdout.trim().split('\n');
      sessions.forEach((s) => {
        if (s.startsWith('workspace-')) {
          console.log(`     ✅ ${s}`);
        } else {
          console.log(`     🔹 ${s} (Non-workspace)`);
        }
      });
    } else {
      console.log('     - No active sessions');
    }
  }

  console.log(
    `--------------------------------------------------------------------------------\n`,
  );
  return 0;
}

runStatus().catch(console.error);
