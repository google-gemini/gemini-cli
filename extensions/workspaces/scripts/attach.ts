/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

import { ProviderFactory } from './providers/ProviderFactory.ts';


const REPO_ROOT = process.cwd();

const q = (str: string) => `'${str.replace(/'/g, "'\\''")}'`;

export async function runAttach(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const prNumber = args[0];
  const action = args[1] || 'review';
  const isLocal = args.includes('--local');

  if (!prNumber) {
    console.error('Usage: workspace attach <PR_NUMBER> [action] [--local]');
    return 1;
  }

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

  const sessionName = `workspace-${prNumber}-${action}`;
  const containerAttach = `sudo docker exec -it maintainer-worker sh -c ${q(`tmux attach-session -t ${sessionName}`)}`;
  const finalSSH = provider.getRunCommand(containerAttach, {
    interactive: true,
  });

  console.log(`🔗 Attaching to session: ${sessionName}...`);

  const isWithinGemini =
    !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;
  if (isWithinGemini && !isLocal) {
    const tempCmdPath = path.join(
      process.env.TMPDIR || '/tmp',
      `workspace-attach-${prNumber}.sh`,
    );
    fs.writeFileSync(tempCmdPath, `#!/bin/bash\n${finalSSH}\nrm "$0"`, {
      mode: 0o755,
    });

    const appleScript = `
      on run argv
        tell application "iTerm"
          tell current window
            set newTab to (create tab with default profile)
            tell current session of newTab
              write text (item 1 of argv) & return
            end tell
          end tell
          activate
        end tell
      end run
    `;
    spawnSync('osascript', ['-', tempCmdPath], { input: appleScript });
    console.log(`✅ iTerm2 tab opened for ${sessionName}.`);
    return 0;
  }

  spawnSync(finalSSH, { stdio: 'inherit', shell: true });
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAttach(process.argv.slice(2)).catch(console.error);
}
