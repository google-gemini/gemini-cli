#!/usr/bin/env npx tsx
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const commands: Record<string, string> = {
  setup: '.gemini/skills/workspaces/scripts/setup.ts',
  shell: '.gemini/skills/workspaces/scripts/orchestrator.ts shell',
  check: '.gemini/skills/workspaces/scripts/check.ts',
  'clean-all': '.gemini/skills/workspaces/scripts/clean.ts',
  kill: '.gemini/skills/workspaces/scripts/clean.ts',
  fleet: '.gemini/skills/workspaces/scripts/fleet.ts',
  status: '.gemini/skills/workspaces/scripts/status.ts',
  attach: '.gemini/skills/workspaces/scripts/attach.ts',
  logs: '.gemini/skills/workspaces/scripts/logs.ts',
};

function printUsage() {
  console.log('Gemini Workspaces Management CLI');
  console.log(
    '\nUsage: scripts/workspaces.ts <command> [args] [--open foreground|tab|window]',
  );
  console.log('\nCommands:');
  console.log(
    '  setup                 Initialize or reconfigure your remote worker',
  );
  console.log('  <pr-number> [action]  Launch a PR task (review, fix, ready)');
  console.log('  shell [id]            Open an ad-hoc interactive session');
  console.log('  status                See worker and session overview');
  console.log('  check <pr-number>     Deep-dive into PR logs');
  console.log('  kill <pr-number> <act> Surgical removal of a task');
  console.log('  clean-all             Full remote cleanup');
  console.log('  fleet <action>        Manage VM life cycle (stop, provision)');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    printUsage();
  }

  let scriptPath = commands[cmd];
  let finalArgs = args.slice(1);

  // Default: If it's a number, it's a PR orchestrator task
  if (!scriptPath && /^\d+$/.test(cmd)) {
    scriptPath = '.gemini/skills/workspaces/scripts/orchestrator.ts';
    finalArgs = args; // Pass the PR number as the first arg
  }

  if (!scriptPath) {
    console.error(`❌ Unknown command: ${cmd}`);
    printUsage();
  }

  const [realScript, ...internalArgs] = scriptPath.split(' ');
  const fullScriptPath = path.join(REPO_ROOT, realScript);

  const result = spawnSync(
    'npx',
    ['tsx', fullScriptPath, ...internalArgs, ...finalArgs],
    { stdio: 'inherit' },
  );

  process.exit(result.status ?? 0);
}

main().catch(console.error);
