/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process';

async function getWorkflowMinutes(): Promise<Record<string, number>> {
  const sevenDaysAgoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const output = execFileSync(
    'gh',
    [
      'run',
      'list',
      '--limit',
      '1000',
      '--created',
      `>=${sevenDaysAgoDate}`,
      '--json',
      'databaseId,workflowName',
    ],
    { encoding: 'utf-8' },
  );

  const runs = JSON.parse(output);
  const workflowMinutes: Record<string, number> = {};
  const token = execFileSync('gh', ['auth', 'token'], {
    encoding: 'utf-8',
  }).trim();
  const repoInfo = JSON.parse(
    execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner'], {
      encoding: 'utf-8',
    }),
  );
  const repoName = repoInfo.nameWithOwner;

  const chunkSize = 20;
  for (let i = 0; i < runs.length; i += chunkSize) {
    const chunk = runs.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (r: { databaseId: number; workflowName?: string }) => {
        try {
          const res = await fetch(
            `https://api.github.com/repos/${repoName}/actions/runs/${r.databaseId}/jobs`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github.v3+json',
              },
            },
          );

          if (!res.ok) return;

          const { jobs } = await res.json();
          let runBillableMinutes = 0;

          for (const job of jobs || []) {
            if (!job.started_at || !job.completed_at) continue;
            const start = new Date(job.started_at).getTime();
            const end = new Date(job.completed_at).getTime();
            const durationMs = end - start;

            if (durationMs > 0) {
              runBillableMinutes += Math.ceil(durationMs / (1000 * 60));
            }
          }

          if (runBillableMinutes > 0) {
            const name = r.workflowName || 'Unknown';
            workflowMinutes[name] =
              (workflowMinutes[name] || 0) + runBillableMinutes;
          }
        } catch {
          // Ignore failures for individual runs
        }
      }),
    );
  }

  return workflowMinutes;
}

async function run() {
  try {
    const workflowMinutes = await getWorkflowMinutes();
    let totalMinutes = 0;

    for (const minutes of Object.values(workflowMinutes)) {
      totalMinutes += minutes;
    }

    const now = new Date().toISOString();
    console.log(
      JSON.stringify({
        metric: 'actions_spend_minutes',
        value: totalMinutes,
        timestamp: now,
        details: workflowMinutes,
      }),
    );

    for (const [name, minutes] of Object.entries(workflowMinutes)) {
      const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      console.log(
        JSON.stringify({
          metric: `actions_spend_minutes_workflow:${safeName}`,
          value: minutes,
          timestamp: now,
        }),
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
