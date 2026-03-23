/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

import { ProviderFactory } from './providers/ProviderFactory.ts';


const REPO_ROOT = process.cwd();

export async function runChecker(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const prNumber = args[0];
  if (!prNumber) {
    console.error('Usage: npm run review:check <PR_NUMBER>');
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
  const { projectId, zone, remoteWorkDir } = config;
  const targetVM = `gcli-workspace-${env.USER || 'mattkorwel'}`;
  const provider = ProviderFactory.getProvider({
    projectId,
    zone,
    instanceName: targetVM,
  });

  console.log(
    `🔍 Checking remote status for PR #${prNumber} on ${targetVM}...`,
  );

  const branchView = spawnSync(
    'gh',
    ['pr', 'view', prNumber, '--json', 'headRefName', '-q', '.headRefName'],
    { shell: true },
  );
  const branchName = branchView.stdout.toString().trim();
  const logDir = `${remoteWorkDir}/${branchName}/.gemini/logs/review-${prNumber}`;

  const tasks = ['build', 'ci', 'review', 'verify'];
  let allDone = true;

  console.log('\n--- Task Status ---');
  for (const task of tasks) {
    const exitFile = `${logDir}/${task}.exit`;
    const checkExit = await provider.getExecOutput(
      `[ -f ${exitFile} ] && cat ${exitFile}`,
      { wrapContainer: 'maintainer-worker' },
    );

    if (checkExit.status === 0 && checkExit.stdout.trim()) {
      const code = checkExit.stdout.trim();
      console.log(
        `  ${code === '0' ? '✅' : '❌'} ${task.padEnd(10)}: ${code === '0' ? 'SUCCESS' : `FAILED (exit ${code})`}`,
      );
    } else {
      const checkRunning = await provider.exec(`[ -f ${logDir}/${task}.log ]`, {
        wrapContainer: 'maintainer-worker',
      });
      if (checkRunning === 0) {
        console.log(`  ⏳ ${task.padEnd(10)}: RUNNING`);
      } else {
        console.log(`  💤 ${task.padEnd(10)}: PENDING`);
      }
      allDone = false;
    }
  }

  if (allDone) {
    console.log(
      '\n✨ All remote tasks complete. You can now synthesize the results.',
    );
  } else {
    console.log(
      '\n⏳ Some tasks are still in progress. Check again in a few minutes.',
    );
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runChecker(process.argv.slice(2)).catch(console.error);
}
