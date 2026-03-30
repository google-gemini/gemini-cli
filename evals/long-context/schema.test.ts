/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LongContextJsonSchemas,
  ManifestSchema,
  RunResultSchema,
  TaskSchema,
} from './schema.js';
import { parseActivityLog } from './activity-log-parser.js';
import { runTask } from './runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures');
const manifestPath = path.join(__dirname, 'manifest.json');
const smokeTaskPath = path.join(__dirname, 'tasks', 'smoke-stream-json.json');

describe('long-context schema', () => {
  it('parses the checked-in manifest and smoke task', () => {
    const manifest = ManifestSchema.parse(
      JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
    );
    const task = TaskSchema.parse(
      JSON.parse(fs.readFileSync(smokeTaskPath, 'utf8')),
    );

    expect(manifest.tasks[0]?.id).toBe('smoke-stream-json');
    expect(task.validation.type).toBe('stream_json');
  });

  it('rejects an invalid manifest fixture', () => {
    const invalidManifestPath = path.join(fixturesDir, 'invalid-manifest.json');
    const invalidManifest = JSON.parse(
      fs.readFileSync(invalidManifestPath, 'utf8'),
    );

    expect(() => ManifestSchema.parse(invalidManifest)).toThrow();
  });

  it('supports git-clone repository definitions', () => {
    const manifest = ManifestSchema.parse(
      JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
    );
    const repository = manifest.repositories.find(
      (item) => item.id === 'clone-fixture-repo',
    );

    expect(repository?.source).toBe('git_clone');
    expect(repository?.url).toContain('clone-source');
    expect(repository?.commitSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('supports command-based task validation', () => {
    const taskPath = path.join(
      __dirname,
      'tasks',
      'smoke-command-validation.json',
    );
    const task = TaskSchema.parse(
      JSON.parse(fs.readFileSync(taskPath, 'utf8')),
    );

    expect(task.validation.type).toBe('command');
    if (task.validation.type === 'command') {
      expect(task.validation.command).toBe('python3');
      expect(task.validation.stdoutIncludes).toContain('COMMAND_SMOKE_SUCCESS');
    }
  });

  it('supports executable-oracle task validation', () => {
    const taskPath = path.join(
      __dirname,
      'tasks',
      'smoke-executable-oracle.json',
    );
    const task = TaskSchema.parse(
      JSON.parse(fs.readFileSync(taskPath, 'utf8')),
    );

    expect(task.validation.type).toBe('executable_oracle');
    if (task.validation.type === 'executable_oracle') {
      expect(task.validation.failToPass).toHaveLength(1);
      expect(task.validation.passToPass).toHaveLength(1);
      expect(task.validation.build?.stdoutIncludes).toContain('exists');
    }
  });

  it('exports json schema definitions', () => {
    expect(LongContextJsonSchemas.manifest).toHaveProperty('$schema');
    expect(LongContextJsonSchemas.task).toHaveProperty('definitions');
    expect(LongContextJsonSchemas.runResult).toHaveProperty('$schema');
  });
});

describe('long-context activity log parser', () => {
  it('extracts metrics from a sample activity log', async () => {
    const activityLogPath = path.join(fixturesDir, 'sample-activity.jsonl');
    const { metrics } = await parseActivityLog(activityLogPath, 1000);

    expect(metrics.toolCallCount).toBe(1);
    expect(metrics.toolNames).toEqual(['read_file']);
    expect(metrics.apiRequestCount).toBe(1);
    expect(metrics.apiErrorCount).toBe(0);
    expect(metrics.chatCompressionCount).toBe(1);
    expect(metrics.compressionTokensSavedTotal).toBe(28);
    expect(metrics.assistantMessageCount).toBe(1);
    expect(metrics.totalTokens).toBe(135);
    expect(metrics.durationMs).toBe(900);
  });
});

describe('long-context runner', () => {
  it('executes the stream-json smoke task and writes report artifacts', async () => {
    const outputDir = path.join(
      fixturesDir,
      'tmp-run',
      `run-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );

    const result = await runTask({
      manifestPath,
      taskId: 'smoke-stream-json',
      outputDir,
    });

    expect(result.status).toBe('passed');
    expect(result.processMetrics.toolCallCount).toBeGreaterThanOrEqual(1);
    expect(result.processMetrics.toolNames).toContain('read_file');
    expect(result.processMetrics.totalTokens).toBeGreaterThanOrEqual(135);
    expect(fs.existsSync(result.artifacts.reportPath)).toBe(true);
    expect(fs.existsSync(result.artifacts.runResultPath)).toBe(true);
    expect(fs.existsSync(result.artifacts.stdoutPath)).toBe(true);

    const storedRunResult = RunResultSchema.parse(
      JSON.parse(fs.readFileSync(result.artifacts.runResultPath, 'utf8')),
    );
    expect(storedRunResult.status).toBe('passed');

    const report = JSON.parse(
      fs.readFileSync(result.artifacts.reportPath, 'utf8'),
    );
    expect(report.testResults[0].assertionResults[0].title).toBe(
      'Smoke stream-json runner task',
    );
    expect(report.testResults[0].assertionResults[0].status).toBe('passed');
  });

  it('executes the command-validation smoke task', async () => {
    const outputDir = path.join(
      fixturesDir,
      'tmp-run',
      `command-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );

    const result = await runTask({
      manifestPath,
      taskId: 'smoke-command-validation',
      outputDir,
    });

    expect(result.status).toBe('passed');
    expect(result.validationSummary).toContain('python3 exited with 0');
    expect(result.validationSummary).toContain(
      'python3 stdout includes COMMAND_SMOKE_SUCCESS',
    );

    const outputFile = path.join(
      __dirname,
      'fixtures',
      'command-workspace',
      'output.txt',
    );
    expect(fs.readFileSync(outputFile, 'utf8')).toContain(
      'COMMAND_SMOKE_SUCCESS',
    );
  });

  it('executes the executable-oracle smoke task', async () => {
    const outputDir = path.join(
      fixturesDir,
      'tmp-run',
      `oracle-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );

    const result = await runTask({
      manifestPath,
      taskId: 'smoke-executable-oracle',
      outputDir,
    });

    expect(result.status).toBe('passed');
    expect(result.validationSummary).toContain(
      'fail-to-pass oracle check exited with 0',
    );
    expect(result.validationSummary).toContain(
      'pass-to-pass original file check stdout includes seed',
    );
    expect(result.validationSummary).toContain(
      'build-style file existence check stdout includes exists',
    );

    const outputFile = path.join(
      __dirname,
      'fixtures',
      'command-workspace',
      'oracle-output.txt',
    );
    expect(fs.readFileSync(outputFile, 'utf8')).toContain(
      'ORACLE_SMOKE_SUCCESS',
    );
  });

  it('executes the git-clone smoke task', async () => {
    const outputDir = path.join(
      fixturesDir,
      'tmp-run',
      `clone-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );

    const result = await runTask({
      manifestPath,
      taskId: 'smoke-git-clone',
      outputDir,
    });

    expect(result.status).toBe('passed');
    expect(result.validationSummary).toContain('python3 exited with 0');
    expect(result.validationSummary).toContain(
      'python3 stdout includes CLONE_SMOKE_SUCCESS',
    );

    const clonedOutput = path.join(
      outputDir,
      'workspace',
      'clone-fixture-repo',
      'clone-output.txt',
    );
    expect(fs.readFileSync(clonedOutput, 'utf8')).toContain(
      'CLONE_SMOKE_SUCCESS',
    );
  });
});
