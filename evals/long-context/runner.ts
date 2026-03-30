/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ManifestSchema,
  RunResultSchema,
  TaskSchema,
  type LongContextTask,
  type Manifest,
  type Repository,
  type RunArtifacts,
  type RunResult,
  type TaskValidation,
} from './schema.js';
import { parseActivityLog } from './activity-log-parser.js';

interface RunnerOptions {
  manifestPath: string;
  taskId?: string;
  outputDir?: string;
}

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface StreamJsonEvent {
  type?: string;
  tool_name?: string;
  role?: 'user' | 'assistant';
  content?: string;
  status?: 'success' | 'error';
  stats?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    duration_ms?: number;
    tool_calls?: number;
  };
}

interface CommandValidationResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

function parseArgs(argv: string[]): RunnerOptions {
  let manifestPath = path.join(__dirname, 'manifest.json');
  let taskId: string | undefined;
  let outputDir: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      manifestPath = path.resolve(argv[index + 1] ?? manifestPath);
      index += 1;
      continue;
    }
    if (arg === '--task-id' || arg === '--task') {
      taskId = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--output-dir') {
      outputDir = path.resolve(argv[index + 1] ?? '');
      index += 1;
    }
  }

  return { manifestPath, taskId, outputDir };
}

function readJsonFile<T>(
  filePath: string,
  schema: { parse: (value: unknown) => T },
): T {
  const raw = fs.readFileSync(filePath, 'utf8');
  return schema.parse(JSON.parse(raw));
}

function loadManifest(manifestPath: string): Manifest {
  return readJsonFile(manifestPath, ManifestSchema);
}

function loadTask(
  manifest: Manifest,
  manifestPath: string,
  taskId?: string,
): LongContextTask {
  const selectedTask = taskId
    ? manifest.tasks.find(
        (task: Manifest['tasks'][number]) => task.id === taskId,
      )
    : manifest.tasks[0];

  if (!selectedTask) {
    throw new Error(
      taskId ? `Task not found: ${taskId}` : 'Manifest contains no tasks',
    );
  }

  const taskPath = path.resolve(path.dirname(manifestPath), selectedTask.file);
  return readJsonFile(taskPath, TaskSchema);
}

function getRepository(manifest: Manifest, repositoryId: string): Repository {
  const repository = manifest.repositories.find(
    (item: Repository) => item.id === repositoryId,
  );
  if (!repository) {
    throw new Error(`Repository not found for task: ${repositoryId}`);
  }
  return repository;
}

function makeRunId(taskId: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${taskId}-${timestamp}`;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function stripAnsi(input: string): string {
  return input.replace(/\u001B\[[0-9;]*m/g, '');
}

/** Resolve manifest `git_clone` URLs: relative paths are from the repo root. */
function resolveGitCloneSourceUrl(url: string): string {
  if (
    url.startsWith('https://') ||
    url.startsWith('http://') ||
    url.startsWith('git@') ||
    url.startsWith('ssh://') ||
    url.startsWith('file:')
  ) {
    return url;
  }
  return path.resolve(repoRoot, url);
}

function resolveRunnerCwd(
  repository: Repository,
  task: LongContextTask,
  runDirectory: string,
): string {
  if (
    repository.source === 'local_workspace' &&
    task.runner.mode === 'local_workspace'
  ) {
    const repositoryRoot = path.resolve(repoRoot, repository.root || '.');
    return path.resolve(repositoryRoot, task.runner.cwd);
  }

  if (repository.source === 'git_clone' && task.runner.mode === 'git_clone') {
    if (!repository.url) {
      throw new Error(
        `Repository URL is required for git_clone: ${repository.id}`,
      );
    }

    const cloneRoot = path.join(runDirectory, 'workspace');
    ensureDir(cloneRoot);
    const cloneName = repository.id.replace(/[^a-zA-Z0-9._-]/g, '-');
    const cloneDir = path.join(cloneRoot, cloneName);

    if (!fs.existsSync(cloneDir)) {
      const cloneSource = resolveGitCloneSourceUrl(repository.url);
      const cloneArgs = [
        '-c',
        'core.hooksPath=/dev/null',
        'clone',
        cloneSource,
        cloneDir,
      ];
      const cloneResult = spawnSync('git', cloneArgs, { encoding: 'utf8' });
      if (cloneResult.status !== 0) {
        throw new Error(
          `Failed to clone repository ${repository.url}: ${cloneResult.stderr || cloneResult.stdout}`,
        );
      }
    }

    if (repository.commitSha) {
      const checkoutResult = spawnSync(
        'git',
        ['checkout', repository.commitSha],
        { cwd: cloneDir, encoding: 'utf8' },
      );
      if (checkoutResult.status !== 0) {
        throw new Error(
          `Failed to checkout ${repository.commitSha}: ${checkoutResult.stderr || checkoutResult.stdout}`,
        );
      }
    }

    return path.resolve(cloneDir, task.runner.cwd);
  }

  throw new Error(
    `Repository source ${repository.source} does not match runner mode ${task.runner.mode}`,
  );
}

function resolveOptionalPath(
  relativePath: string | undefined,
): string | undefined {
  return relativePath ? path.resolve(repoRoot, relativePath) : undefined;
}

function resolveCliEntrypoint(): string {
  return path.join(repoRoot, 'bundle', 'gemini.js');
}

function runDirectoryForEnv(runDirectory: string): string {
  return path.join(runDirectory, '.runner-home');
}

function ensureRunnerHome(runDirectory: string): string {
  const runnerHome = runDirectoryForEnv(runDirectory);
  const geminiHome = path.join(runnerHome, '.gemini');
  fs.mkdirSync(geminiHome, { recursive: true });
  return runnerHome;
}

async function runCli(
  task: LongContextTask,
  cwd: string,
  activityLogPath: string,
  runDirectory: string,
): Promise<SpawnResult> {
  const cliEntry = resolveCliEntrypoint();
  const args = [
    '--prompt',
    task.prompt,
    '--output-format',
    task.runner.outputFormat,
    '--approval-mode',
    task.runner.approvalMode,
    ...task.runner.cliArgs,
  ];

  const fakeResponsesPath = resolveOptionalPath(task.runner.fakeResponsesPath);
  if (fakeResponsesPath) {
    args.push('--fake-responses', fakeResponsesPath);
  }

  const runnerHome = ensureRunnerHome(runDirectory);
  const env = {
    ...process.env,
    ['GEMINI_API_KEY']: process.env['GEMINI_API_KEY'] || 'test-api-key',
    GEMINI_CLI_HOME: runnerHome,
    GEMINI_CLI_ACTIVITY_LOG_TARGET: activityLogPath,
    GEMINI_SANDBOX: 'false',
    NO_COLOR: '1',
    VITEST: 'true',
  };

  return await new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn('node', [cliEntry, ...args], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function runValidationCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<CommandValidationResult> {
  return await new Promise<CommandValidationResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function runValidationCheck(
  check: Extract<TaskValidation, { command: string }>,
  cwd: string,
): Promise<string[]> {
  const validationCwd = check.cwd ? path.resolve(cwd, check.cwd) : cwd;
  const result = await runValidationCommand(
    check.command,
    check.args,
    validationCwd,
  );
  const label = check.label || check.command;
  const validations: string[] = [];

  if (result.exitCode !== check.expectedExitCode) {
    throw new Error(
      `${label} exited with ${result.exitCode} (expected ${check.expectedExitCode})`,
    );
  }
  validations.push(`${label} exited with ${result.exitCode}`);

  for (const expectedText of check.stdoutIncludes) {
    if (!result.stdout.includes(expectedText)) {
      throw new Error(`${label} stdout missing: ${expectedText}`);
    }
    validations.push(`${label} stdout includes ${expectedText}`);
  }

  for (const expectedText of check.stderrIncludes) {
    if (!result.stderr.includes(expectedText)) {
      throw new Error(`${label} stderr missing: ${expectedText}`);
    }
    validations.push(`${label} stderr includes ${expectedText}`);
  }

  return validations;
}

function parseStreamJsonLines(stdout: string): StreamJsonEvent[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as StreamJsonEvent);
}

async function validateTaskOutput(
  task: LongContextTask,
  stdout: string,
  exitCode: number,
  cwd: string,
): Promise<string[]> {
  const validations: string[] = [];

  if (task.validation.type === 'stream_json') {
    const events = parseStreamJsonLines(stdout);
    const toolNames = new Set(
      events
        .filter((event) => event.type === 'tool_use' && event.tool_name)
        .map((event) => event.tool_name as string),
    );
    const assistantOutput = events
      .filter(
        (event) =>
          event.type === 'message' &&
          event.role === 'assistant' &&
          event.content,
      )
      .map((event) => event.content as string)
      .join('');
    const resultEvent = [...events]
      .reverse()
      .find((event) => event.type === 'result');

    for (const toolName of task.validation.requiredToolNames) {
      if (!toolNames.has(toolName)) {
        throw new Error(`Expected tool call was not observed: ${toolName}`);
      }
      validations.push(`observed tool call ${toolName}`);
    }

    for (const expectedText of task.validation.finalOutputIncludes) {
      if (!assistantOutput.includes(expectedText)) {
        throw new Error(`Expected assistant output not found: ${expectedText}`);
      }
      validations.push(`assistant output includes ${expectedText}`);
    }

    if (!resultEvent) {
      throw new Error('Missing final result event in stream-json output');
    }

    if (resultEvent.status !== task.validation.requiredResultStatus) {
      throw new Error(
        `Unexpected result status: ${resultEvent.status ?? 'unknown'} (expected ${task.validation.requiredResultStatus})`,
      );
    }

    validations.push(`result status ${resultEvent.status}`);
  }

  if (task.validation.type === 'command') {
    validations.push(...(await runValidationCheck(task.validation, cwd)));
  }

  if (task.validation.type === 'executable_oracle') {
    for (const check of task.validation.failToPass) {
      validations.push(...(await runValidationCheck(check, cwd)));
    }
    for (const check of task.validation.passToPass) {
      validations.push(...(await runValidationCheck(check, cwd)));
    }
    if (task.validation.build) {
      validations.push(
        ...(await runValidationCheck(task.validation.build, cwd)),
      );
    }
    for (const check of task.validation.augmented) {
      validations.push(...(await runValidationCheck(check, cwd)));
    }
  }

  if (task.validation.type === 'final_output_contains') {
    const cleanedStdout = stripAnsi(stdout);
    if (!cleanedStdout.includes(task.validation.text)) {
      throw new Error(`Expected stdout to include: ${task.validation.text}`);
    }
    validations.push(`stdout includes ${task.validation.text}`);
  }

  if (exitCode !== 0) {
    throw new Error(`CLI exited with non-zero status: ${exitCode}`);
  }
  validations.push('cli exited successfully');

  return validations;
}

function buildVitestCompatibleReport(
  task: LongContextTask,
  status: 'passed' | 'failed',
) {
  return {
    numTotalTestSuites: 1,
    numPassedTestSuites: status === 'passed' ? 1 : 0,
    numFailedTestSuites: status === 'failed' ? 1 : 0,
    numPendingTestSuites: 0,
    numTotalTests: 1,
    numPassedTests: status === 'passed' ? 1 : 0,
    numFailedTests: status === 'failed' ? 1 : 0,
    numPendingTests: 0,
    numTodoTests: 0,
    success: status === 'passed',
    startTime: Date.now(),
    testResults: [
      {
        assertionResults: [
          {
            title: task.title,
            status,
          },
        ],
      },
    ],
  };
}

function mergeMetricValue(
  primary: number | undefined,
  secondary: number | undefined,
): number | undefined {
  if (primary === undefined) {
    return secondary;
  }
  if (secondary === undefined) {
    return primary;
  }
  return Math.max(primary, secondary);
}

function mergeProcessMetrics(
  primary: RunResult['processMetrics'],
  secondary: RunResult['processMetrics'],
): RunResult['processMetrics'] {
  return {
    toolCallCount: Math.max(primary.toolCallCount, secondary.toolCallCount),
    toolNames: Array.from(
      new Set([...primary.toolNames, ...secondary.toolNames]),
    ),
    apiRequestCount: Math.max(
      primary.apiRequestCount,
      secondary.apiRequestCount,
    ),
    apiErrorCount: Math.max(primary.apiErrorCount, secondary.apiErrorCount),
    chatCompressionCount: Math.max(
      primary.chatCompressionCount,
      secondary.chatCompressionCount,
    ),
    compressionTokensSavedTotal: Math.max(
      primary.compressionTokensSavedTotal,
      secondary.compressionTokensSavedTotal,
    ),
    assistantMessageCount: Math.max(
      primary.assistantMessageCount,
      secondary.assistantMessageCount,
    ),
    totalTokens: mergeMetricValue(primary.totalTokens, secondary.totalTokens),
    inputTokens: mergeMetricValue(primary.inputTokens, secondary.inputTokens),
    outputTokens: mergeMetricValue(
      primary.outputTokens,
      secondary.outputTokens,
    ),
    durationMs: Math.max(primary.durationMs, secondary.durationMs),
  };
}

export async function runTask(options: RunnerOptions): Promise<RunResult> {
  const manifest = loadManifest(options.manifestPath);
  const task = loadTask(manifest, options.manifestPath, options.taskId);
  const repository = getRepository(manifest, task.repositoryId);

  const runId = makeRunId(task.id);
  const runDirectory =
    options.outputDir ??
    path.join(repoRoot, 'evals', 'logs', 'long-context', runId);
  ensureDir(runDirectory);

  const stdoutPath = path.join(runDirectory, 'stdout.log');
  const stderrPath = path.join(runDirectory, 'stderr.log');
  const activityLogPath = path.join(runDirectory, 'activity.jsonl');
  const reportPath = path.join(runDirectory, 'report.json');
  const runResultPath = path.join(runDirectory, 'run-result.json');

  const artifacts: RunArtifacts = {
    runDirectory,
    stdoutPath,
    stderrPath,
    activityLogPath,
    reportPath,
    runResultPath,
  };

  const startedAt = new Date();
  const cwd = resolveRunnerCwd(repository, task, runDirectory);
  let validationSummary: string[] = [];
  let errorMessage: string | undefined;
  let status: 'passed' | 'failed' = 'passed';

  const spawnResult = await runCli(task, cwd, activityLogPath, runDirectory);
  fs.writeFileSync(stdoutPath, spawnResult.stdout);
  fs.writeFileSync(stderrPath, spawnResult.stderr);

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  try {
    validationSummary = await validateTaskOutput(
      task,
      spawnResult.stdout,
      spawnResult.exitCode,
      cwd,
    );
  } catch (error) {
    status = 'failed';
    errorMessage = error instanceof Error ? error.message : String(error);
    validationSummary = errorMessage ? [errorMessage] : [];
  }

  const { metrics } = await parseActivityLog(activityLogPath, durationMs);
  const stdoutMetrics = (await parseActivityLog(stdoutPath, durationMs))
    .metrics;
  const mergedMetrics = mergeProcessMetrics(metrics, stdoutMetrics);
  const runResult = RunResultSchema.parse({
    taskId: task.id,
    title: task.title,
    repositoryId: task.repositoryId,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    prompt: task.prompt,
    validationSummary,
    errorMessage,
    artifacts,
    processMetrics: mergedMetrics,
  });

  const report = buildVitestCompatibleReport(task, status);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(runResultPath, JSON.stringify(runResult, null, 2));

  return runResult;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runResult = await runTask(options);
  process.stdout.write(JSON.stringify(runResult, null, 2) + '\n');
  if (runResult.status === 'failed') {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === __filename) {
  main().catch((error) => {
    const message =
      error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(message + '\n');
    process.exit(1);
  });
}
