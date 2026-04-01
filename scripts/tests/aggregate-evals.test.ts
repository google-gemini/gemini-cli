/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe('aggregate_evals.js', () => {
  const originalArgv = [...process.argv];
  const originalGhToken = process.env.GH_TOKEN;
  let tempDir: string;
  let logSpy: ReturnType<typeof vi.spyOn> | undefined;
  let errorSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aggregate-evals-'));
    delete process.env.GH_TOKEN;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = [...originalArgv];
    if (originalGhToken === undefined) {
      delete process.env.GH_TOKEN;
    } else {
      process.env.GH_TOKEN = originalGhToken;
    }
    logSpy?.mockRestore();
    errorSpy?.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('prints the long-context summary for summary.json artifacts', async () => {
    const artifactRoot = path.join(
      tempDir,
      'long-context-logs-gemini-2.5-pro-1',
      'manifest-2026-03-30T07-46-31-610Z',
    );

    writeJson(path.join(artifactRoot, 'summary.json'), {
      manifestPath: '/tmp/manifest.json',
      runDirectory: artifactRoot,
      startedAt: '2026-03-30T07:46:31.610Z',
      finishedAt: '2026-03-30T07:46:37.976Z',
      durationMs: 6366,
      totalTasks: 2,
      passedTasks: 1,
      failedTasks: 1,
      taskResults: [
        {
          taskId: 'smoke-stream-json',
          title: 'Smoke stream-json runner task',
          repositoryId: 'gemini-cli-local',
          status: 'passed',
          runResultPath: path.join(
            artifactRoot,
            'smoke-stream-json/run-result.json',
          ),
          reportPath: path.join(artifactRoot, 'smoke-stream-json/report.json'),
        },
        {
          taskId: 'benchmark-clone-executable-oracle',
          title: 'Clone executable-oracle benchmark slice',
          repositoryId: 'clone-fixture-repo',
          status: 'failed',
          failureCategory: 'tool_mismatch',
          runResultPath: path.join(
            artifactRoot,
            'benchmark-clone-executable-oracle/run-result.json',
          ),
          reportPath: path.join(
            artifactRoot,
            'benchmark-clone-executable-oracle/report.json',
          ),
        },
      ],
      aggregatedMetrics: {
        toolCallCount: 7,
        toolNames: ['read_file', 'write_file', 'grep_search'],
        apiRequestCount: 1,
        apiErrorCount: 0,
        chatCompressionCount: 1,
        compressionTokensSavedTotal: 28,
        assistantMessageCount: 4,
        delegationCount: 2,
        delegatedAgentNames: ['Explore'],
        filesRead: ['original.txt', 'README.txt'],
        filesEdited: [],
        filesWritten: ['clone-output.txt'],
        fileReadCount: 2,
        fileEditCount: 0,
        fileWriteCount: 1,
        searchToolCallCount: 1,
        totalTokens: 900,
        inputTokens: 700,
        outputTokens: 200,
        durationMs: 6366,
      },
      failureCategoryCounts: {
        tool_mismatch: 1,
      },
    });

    process.argv = ['node', 'aggregate_evals.js', tempDir];
    await import('../aggregate_evals.js');

    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('### Long-context Eval Summary');
    expect(output).toContain('gemini-2.5-pro');
    expect(output).toContain('50.0%');
    expect(output).toContain('Smoke stream-json runner task');
    expect(output).toContain('Clone executable-oracle benchmark slice');
    expect(output).toContain('tool_mismatch (1)');
    expect(output).not.toContain('No reports found.');
  });

  it('prints both eval and long-context sections when both artifact types exist', async () => {
    const evalRoot = path.join(
      tempDir,
      'eval-logs-gemini-2.5-pro-1',
      'evals',
      'logs',
    );
    const longContextRoot = path.join(
      tempDir,
      'long-context-logs-gemini-2.5-pro-1',
      'manifest-2026-03-30T07-46-31-610Z',
    );

    writeJson(path.join(evalRoot, 'report.json'), {
      testResults: [
        {
          assertionResults: [
            { title: 'sample eval', status: 'passed' },
            { title: 'another eval', status: 'failed' },
          ],
        },
      ],
    });

    writeJson(path.join(longContextRoot, 'summary.json'), {
      manifestPath: '/tmp/manifest.json',
      runDirectory: longContextRoot,
      startedAt: '2026-03-30T07:46:31.610Z',
      finishedAt: '2026-03-30T07:46:37.976Z',
      durationMs: 6366,
      totalTasks: 1,
      passedTasks: 1,
      failedTasks: 0,
      taskResults: [
        {
          taskId: 'smoke-stream-json',
          title: 'Smoke stream-json runner task',
          repositoryId: 'gemini-cli-local',
          status: 'passed',
          runResultPath: path.join(
            longContextRoot,
            'smoke-stream-json/run-result.json',
          ),
          reportPath: path.join(
            longContextRoot,
            'smoke-stream-json/report.json',
          ),
        },
      ],
      aggregatedMetrics: {
        toolCallCount: 1,
        toolNames: ['read_file'],
        apiRequestCount: 0,
        apiErrorCount: 0,
        chatCompressionCount: 0,
        compressionTokensSavedTotal: 0,
        assistantMessageCount: 1,
        delegationCount: 0,
        delegatedAgentNames: [],
        filesRead: ['original.txt'],
        filesEdited: [],
        filesWritten: [],
        fileReadCount: 1,
        fileEditCount: 0,
        fileWriteCount: 0,
        searchToolCallCount: 0,
        totalTokens: 100,
        inputTokens: 80,
        outputTokens: 20,
        durationMs: 1000,
      },
      failureCategoryCounts: {},
    });

    process.argv = ['node', 'aggregate_evals.js', tempDir];
    await import('../aggregate_evals.js');

    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('### Evals Nightly Summary');
    expect(output).toContain('### Long-context Eval Summary');
    expect(output).toContain('sample eval');
    expect(output).toContain('Smoke stream-json runner task');
  });
});
