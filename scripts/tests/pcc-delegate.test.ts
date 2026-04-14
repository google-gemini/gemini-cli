/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.join(import.meta.dirname, '..', '..');
const delegateScript = path.join(repoRoot, 'scripts', 'pcc-delegate');

async function createTempTaskFile(task: unknown): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pcc-delegate-'));
  const taskPath = path.join(tempDir, 'task.json');
  await fs.writeFile(taskPath, JSON.stringify(task, null, 2), 'utf8');
  return taskPath;
}

function runDelegate(taskPath: string, extraArgs: string[] = []) {
  const output = execFileSync(
    'python3',
    [delegateScript, '--task-path', taskPath, ...extraArgs],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  return JSON.parse(output) as {
    pre_dispatch_decision: string;
    controller_decision: string;
    dispatch_gate: { execution_mode: string };
    result: { error: string | null; prompt?: string };
  };
}

describe('pcc-delegate pre-dispatch gate', () => {
  const tempPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempPaths.map((taskPath) =>
        fs.rm(path.dirname(taskPath), { recursive: true, force: true }),
      ),
    );
    tempPaths.length = 0;
  });

  it('allows a dry-run analysis task past pre-dispatch gate and keeps execution in review', async () => {
    const taskPath = await createTempTaskFile({
      version: 1,
      task_id: 'analysis-task',
      title: 'Analyze routing policy',
      role: 'router',
      runtime: 'gemini',
      preset: '監',
      model: 'fast',
      objective: 'Audit the routing policy.',
      context: ['Use repo evidence only.'],
      constraints: ['Do not claim execution.'],
      required_evidence: ['File references', 'Policy table'],
      success_criteria: ['One clear recommendation', 'One concrete boundary'],
      artifacts_expected: ['Decision note'],
      dispatch_gate: {
        execution_mode: 'analysis',
        allowed_runtimes: ['gemini'],
        require_artifacts: true,
        min_required_evidence: 2,
        min_success_criteria: 2,
      },
      next_actions: {
        allow: 'Proceed.',
        review: 'Review.',
        reject: 'Reject.',
        retry: 'Retry.',
      },
    });
    tempPaths.push(taskPath);

    const report = runDelegate(taskPath, ['--dry-run']);

    expect(report.pre_dispatch_decision).toBe('allow');
    expect(report.controller_decision).toBe('review');
    expect(report.dispatch_gate.execution_mode).toBe('analysis');
    expect(report.result.prompt).toContain('Dispatch gate:');
  });

  it('rejects unsupported runtime execution before dispatching to Gemini', async () => {
    const taskPath = await createTempTaskFile({
      version: 1,
      task_id: 'blocked-execute-task',
      title: 'Execute changes through Gemini',
      role: 'builder',
      runtime: 'gemini',
      preset: '刃',
      model: 'fast',
      objective: 'Attempt an execute-mode task.',
      context: ['Builder task'],
      constraints: ['Strict PCC control'],
      required_evidence: ['Diff path', 'Test result'],
      success_criteria: ['Concrete output', 'Evidence-backed summary'],
      artifacts_expected: ['Patch file'],
      dispatch_gate: {
        execution_mode: 'execute',
        allowed_runtimes: ['gemini'],
        require_artifacts: true,
        min_required_evidence: 2,
        min_success_criteria: 2,
      },
      next_actions: {
        allow: 'Proceed.',
        review: 'Review.',
        reject: 'Reject.',
        retry: 'Retry.',
      },
    });
    tempPaths.push(taskPath);

    const report = runDelegate(taskPath);

    expect(report.pre_dispatch_decision).toBe('reject');
    expect(report.controller_decision).toBe('reject');
    expect(report.result.error).toBe('PRE_DISPATCH_REJECT');
  });

  it('returns retry for execute-mode Jules tasks without explicit config', async () => {
    const taskPath = await createTempTaskFile({
      version: 1,
      task_id: 'jules-retry-task',
      title: 'Execute through Jules without config',
      role: 'builder',
      runtime: 'jules',
      preset: '刃',
      model: 'deep',
      objective: 'Attempt a Jules execute task.',
      context: ['Builder task'],
      constraints: ['Require explicit config'],
      required_evidence: ['Diff path', 'Test result'],
      success_criteria: ['Concrete output', 'Evidence-backed summary'],
      artifacts_expected: ['Patch file'],
      dispatch_gate: {
        execution_mode: 'execute',
        allowed_runtimes: ['jules'],
        require_artifacts: true,
        min_required_evidence: 2,
        min_success_criteria: 2,
      },
      next_actions: {
        allow: 'Proceed.',
        review: 'Review.',
        reject: 'Reject.',
        retry: 'Retry.',
      },
    });
    tempPaths.push(taskPath);

    const report = runDelegate(taskPath);

    expect(report.pre_dispatch_decision).toBe('retry');
    expect(report.controller_decision).toBe('retry');
    expect(report.result.error).toBe('PRE_DISPATCH_RETRY');
  });
});
