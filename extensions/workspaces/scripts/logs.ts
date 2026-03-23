/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';



const REPO_ROOT = process.cwd();

export async function runLogs(args: string[]) {
  const prNumber = args[0];
  const action = args[1] || 'review';

  if (!prNumber) {
    console.error('Usage: workspace logs <PR_NUMBER> [action]');
    return 1;
  }

  const settingsPath = path.join(REPO_ROOT, '.gemini/settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.maintainer?.workspace;
  const { remoteHost, remoteHome } = config;
  const sshConfigPath = path.join(REPO_ROOT, '.gemini/workspace_ssh_config');

  const jobDir = `${remoteHome}/dev/worktrees/workspace-${prNumber}-${action}`;
  const logDir = `${jobDir}/.gemini/logs`;

  console.log(`📋 Tailing latest logs for job ${prNumber}-${action}...`);

  // Remote command to find the latest log file and tail it
  const tailCmd = `
    latest_log=$(ls -t ${logDir}/*.log 2>/dev/null | head -n 1)
    if [ -z "$latest_log" ]; then
      echo "❌ No logs found for this job yet."
      exit 1
    fi
    echo "📄 Tailing: $latest_log"
    tail -f "$latest_log"
  `;

  spawnSync(
    `ssh -F ${sshConfigPath} ${remoteHost} ${JSON.stringify(tailCmd)}`,
    { stdio: 'inherit', shell: true },
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLogs(process.argv.slice(2)).catch(console.error);
}
