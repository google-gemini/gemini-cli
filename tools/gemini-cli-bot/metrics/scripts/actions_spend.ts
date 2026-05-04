/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process';

function getWorkflowMinutes(): Record<string, number> {
  const output = execFileSync(
    'gh',
    [
      'run',
      'list',
      '--limit',
      '1000',
      '--json',
      'workflowName,startedAt,updatedAt',
    ],
    { encoding: 'utf-8' },
  );
  const runs = JSON.parse(output);

  const workflowMinutes: Record<string, number> = {};
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const r of runs) {
    if (!r.startedAt || !r.updatedAt) continue;

    const start = new Date(r.startedAt).getTime();
    if (start < sevenDaysAgo) continue;
    const end = new Date(r.updatedAt).getTime();
    const durationMinutes = (end - start) / (1000 * 60);

    if (durationMinutes >= 0) {
      const name = r.workflowName || 'Unknown';
      workflowMinutes[name] = (workflowMinutes[name] || 0) + durationMinutes;
    }
  }

  return workflowMinutes;
}

function run() {
  try {
    const workflowMinutes = getWorkflowMinutes();
    let totalMinutes = 0;

    for (const minutes of Object.values(workflowMinutes)) {
      totalMinutes += minutes;
    }

    process.stdout.write(
      `actions_spend_overall_minutes,${Math.round(totalMinutes * 100) / 100}\n`,
    );

    for (const [name, minutes] of Object.entries(workflowMinutes)) {
      const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      process.stdout.write(
        `actions_spend_workflow_${safeName}_minutes,${Math.round(minutes * 100) / 100}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

run();
