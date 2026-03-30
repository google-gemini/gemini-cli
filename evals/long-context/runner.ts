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
  ManifestRunSummarySchema,
  ManifestSchema,
  RunResultSchema,
  TaskSchema,
  type LongContextTask,
  type Manifest,
  type ManifestRunSummary,
  type ManifestRunTaskSummary,
  type ProcessMetrics,
  type Repository,
  type RunArtifacts,
  type RunResult,
  type TaskValidation,
  type ValidationBreakdown,
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

interface ValidationOutcome {
  summary: string[];
  breakdown?: ValidationBreakdown;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const SUMMARY_FILE_NAME = 'summary.json';

function parseArgs(argv: string[]): RunnerOptions {
  let manifestPath = path.join(__dirname, 'manifest.json');
  let taskId: string | undefined;
  let outputDir: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg.startsWith('--manifest=')) {
      manifestPath = path.resolve(arg.slice('--manifest='.length));
      continue;
    }
    if (arg.startsWith('--task-id=')) {
      taskId = arg.slice('--task-id='.length);
      continue;
    }
    if (arg.startsWith('--task=')) {
      taskId = arg.slice('--task='.length);
      continue;
    }
    if (arg.startsWith('--output-dir=')) {
      outputDir = path.resolve(arg.slice('--output-dir='.length));
      continue;
    }

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

function loadTaskByEntry(
  manifestPath: string,
  taskEntry: Manifest['tasks'][number],
): LongContextTask {
  const taskPath = path.resolve(path.dirname(manifestPath), taskEntry.file);
  return readJsonFile(taskPath, TaskSchema);
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

  return loadTaskByEntry(manifestPath, selectedTask);
}

function loadTasksToRun(
  manifest: Manifest,
  manifestPath: string,
  taskId?: string,
): LongContextTask[] {
  if (taskId) {
    return [loadTask(manifest, manifestPath, taskId)];
  }

  return manifest.tasks
    .map((taskEntry) => loadTaskByEntry(manifestPath, taskEntry))
    .filter((task) => !task.retired);
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

function makeManifestRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `manifest-${timestamp}`;
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

function summarizeExecutableOracleBreakdown(
  validation: Extract<TaskValidation, { type: 'executable_oracle' }>,
): ValidationBreakdown {
  return {
    failToPassPassed: validation.failToPass.length,
    failToPassTotal: validation.failToPass.length,
    passToPassPassed: validation.passToPass.length,
    passToPassTotal: validation.passToPass.length,
    augmentedPassed: validation.augmented.length,
    augmentedTotal: validation.augmented.length,
    buildPassed: validation.build ? true : undefined,
  };
}

async function validateTaskOutput(
  task: LongContextTask,
  stdout: string,
  exitCode: number,
  cwd: string,
): Promise<ValidationOutcome> {
  const validations: string[] = [];
  let validationBreakdown: ValidationBreakdown | undefined;

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
    validationBreakdown = summarizeExecutableOracleBreakdown(task.validation);
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

  return {
    summary: validations,
    breakdown: validationBreakdown,
  };
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

function mergePathLists(primary: string[], secondary: string[]): string[] {
  return Array.from(new Set([...primary, ...secondary]));
}

function mergeProcessMetrics(
  primary: ProcessMetrics,
  secondary: ProcessMetrics,
): ProcessMetrics {
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
    delegationCount: Math.max(
      primary.delegationCount,
      secondary.delegationCount,
    ),
    delegatedAgentNames: mergePathLists(
      primary.delegatedAgentNames,
      secondary.delegatedAgentNames,
    ),
    filesRead: mergePathLists(primary.filesRead, secondary.filesRead),
    filesEdited: mergePathLists(primary.filesEdited, secondary.filesEdited),
    filesWritten: mergePathLists(primary.filesWritten, secondary.filesWritten),
    fileReadCount: Math.max(primary.fileReadCount, secondary.fileReadCount),
    fileEditCount: Math.max(primary.fileEditCount, secondary.fileEditCount),
    fileWriteCount: Math.max(primary.fileWriteCount, secondary.fileWriteCount),
    searchToolCallCount: Math.max(
      primary.searchToolCallCount,
      secondary.searchToolCallCount,
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

function sumMetricValue(
  primary: number | undefined,
  secondary: number | undefined,
): number | undefined {
  if (primary === undefined && secondary === undefined) {
    return undefined;
  }
  return (primary ?? 0) + (secondary ?? 0);
}

function aggregateProcessMetrics(
  metricsList: ProcessMetrics[],
): ProcessMetrics {
  return metricsList.reduce<ProcessMetrics>(
    (aggregate, metrics) => ({
      toolCallCount: aggregate.toolCallCount + metrics.toolCallCount,
      toolNames: Array.from(
        new Set([...aggregate.toolNames, ...metrics.toolNames]),
      ),
      apiRequestCount: aggregate.apiRequestCount + metrics.apiRequestCount,
      apiErrorCount: aggregate.apiErrorCount + metrics.apiErrorCount,
      chatCompressionCount:
        aggregate.chatCompressionCount + metrics.chatCompressionCount,
      compressionTokensSavedTotal:
        aggregate.compressionTokensSavedTotal +
        metrics.compressionTokensSavedTotal,
      assistantMessageCount:
        aggregate.assistantMessageCount + metrics.assistantMessageCount,
      delegationCount: aggregate.delegationCount + metrics.delegationCount,
      delegatedAgentNames: mergePathLists(
        aggregate.delegatedAgentNames,
        metrics.delegatedAgentNames,
      ),
      filesRead: mergePathLists(aggregate.filesRead, metrics.filesRead),
      filesEdited: mergePathLists(aggregate.filesEdited, metrics.filesEdited),
      filesWritten: mergePathLists(
        aggregate.filesWritten,
        metrics.filesWritten,
      ),
      fileReadCount: aggregate.fileReadCount + metrics.fileReadCount,
      fileEditCount: aggregate.fileEditCount + metrics.fileEditCount,
      fileWriteCount: aggregate.fileWriteCount + metrics.fileWriteCount,
      searchToolCallCount:
        aggregate.searchToolCallCount + metrics.searchToolCallCount,
      totalTokens: sumMetricValue(aggregate.totalTokens, metrics.totalTokens),
      inputTokens: sumMetricValue(aggregate.inputTokens, metrics.inputTokens),
      outputTokens: sumMetricValue(
        aggregate.outputTokens,
        metrics.outputTokens,
      ),
      durationMs: aggregate.durationMs + metrics.durationMs,
    }),
    {
      toolCallCount: 0,
      toolNames: [],
      apiRequestCount: 0,
      apiErrorCount: 0,
      chatCompressionCount: 0,
      compressionTokensSavedTotal: 0,
      assistantMessageCount: 0,
      delegationCount: 0,
      delegatedAgentNames: [],
      filesRead: [],
      filesEdited: [],
      filesWritten: [],
      fileReadCount: 0,
      fileEditCount: 0,
      fileWriteCount: 0,
      searchToolCallCount: 0,
      durationMs: 0,
    },
  );
}

function classifyFailure(
  task: LongContextTask,
  metrics: ProcessMetrics,
  status: RunResult['status'],
): string | undefined {
  if (status !== 'failed') {
    return undefined;
  }

  const touchedFileCount =
    metrics.filesRead.length +
    metrics.filesEdited.length +
    metrics.filesWritten.length;

  if (metrics.chatCompressionCount > 0) {
    return 'context_loss_after_compression';
  }

  if (
    (metrics.fileEditCount > 0 || metrics.fileWriteCount > 0) &&
    metrics.fileReadCount <= 1 &&
    metrics.searchToolCallCount === 0
  ) {
    return 'premature_commitment';
  }

  if (metrics.fileReadCount >= 3 && metrics.searchToolCallCount === 0) {
    return 'tool_mismatch';
  }

  if (
    task.expectedScope?.minFilesTouched !== undefined &&
    touchedFileCount < task.expectedScope.minFilesTouched
  ) {
    return 'scope_under_estimation';
  }

  return 'unclassified';
}

function createRunArtifacts(runDirectory: string): RunArtifacts {
  return {
    runDirectory,
    stdoutPath: path.join(runDirectory, 'stdout.log'),
    stderrPath: path.join(runDirectory, 'stderr.log'),
    activityLogPath: path.join(runDirectory, 'activity.jsonl'),
    reportPath: path.join(runDirectory, 'report.json'),
    runResultPath: path.join(runDirectory, 'run-result.json'),
  };
}

function createTaskRunDirectory(
  baseRunDirectory: string,
  taskId: string,
): string {
  return path.join(baseRunDirectory, taskId);
}

export async function runSingleTask(
  manifest: Manifest,
  task: LongContextTask,
  baseRunDirectory?: string,
): Promise<RunResult> {
  const repository = getRepository(manifest, task.repositoryId);

  const runDirectory =
    baseRunDirectory ??
    path.join(repoRoot, 'evals', 'logs', 'long-context', makeRunId(task.id));
  ensureDir(runDirectory);

  const artifacts = createRunArtifacts(runDirectory);
  const startedAt = new Date();
  const cwd = resolveRunnerCwd(repository, task, runDirectory);
  let validationSummary: string[] = [];
  let validationBreakdown: ValidationBreakdown | undefined;
  let errorMessage: string | undefined;
  let status: 'passed' | 'failed' = 'passed';

  const spawnResult = await runCli(
    task,
    cwd,
    artifacts.activityLogPath,
    runDirectory,
  );
  fs.writeFileSync(artifacts.stdoutPath, spawnResult.stdout);
  fs.writeFileSync(artifacts.stderrPath, spawnResult.stderr);

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  try {
    const validationOutcome = await validateTaskOutput(
      task,
      spawnResult.stdout,
      spawnResult.exitCode,
      cwd,
    );
    validationSummary = validationOutcome.summary;
    validationBreakdown = validationOutcome.breakdown;
  } catch (error) {
    status = 'failed';
    errorMessage = error instanceof Error ? error.message : String(error);
    validationSummary = errorMessage ? [errorMessage] : [];
  }

  const { metrics } = await parseActivityLog(
    artifacts.activityLogPath,
    durationMs,
  );
  const stdoutMetrics = (
    await parseActivityLog(artifacts.stdoutPath, durationMs)
  ).metrics;
  const mergedMetrics = mergeProcessMetrics(metrics, stdoutMetrics);
  const failureCategory = classifyFailure(task, mergedMetrics, status);

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
    validationBreakdown,
    failureCategory,
    errorMessage,
    artifacts,
    processMetrics: mergedMetrics,
  });

  const report = buildVitestCompatibleReport(task, status);
  fs.writeFileSync(artifacts.reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(artifacts.runResultPath, JSON.stringify(runResult, null, 2));

  return runResult;
}

export async function runTask(options: RunnerOptions): Promise<RunResult> {
  const manifest = loadManifest(options.manifestPath);
  const task = loadTask(manifest, options.manifestPath, options.taskId);
  return await runSingleTask(manifest, task, options.outputDir);
}

export async function runManifest(
  options: RunnerOptions,
): Promise<ManifestRunSummary> {
  const manifest = loadManifest(options.manifestPath);
  const tasks = loadTasksToRun(manifest, options.manifestPath, options.taskId);

  if (tasks.length === 0) {
    throw new Error('Manifest contains no runnable tasks');
  }

  const startedAt = new Date();
  const runDirectory =
    options.outputDir ??
    path.join(repoRoot, 'evals', 'logs', 'long-context', makeManifestRunId());
  ensureDir(runDirectory);

  const taskResults: RunResult[] = [];
  for (const task of tasks) {
    const taskRunDirectory = createTaskRunDirectory(runDirectory, task.id);
    const taskResult = await runSingleTask(manifest, task, taskRunDirectory);
    taskResults.push(taskResult);
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const passedTasks = taskResults.filter(
    (result) => result.status === 'passed',
  ).length;
  const failedTasks = taskResults.length - passedTasks;
  const aggregatedMetrics = aggregateProcessMetrics(
    taskResults.map((result) => result.processMetrics),
  );
  const failureCategoryCounts = taskResults.reduce<Record<string, number>>(
    (counts, result) => {
      if (!result.failureCategory) {
        return counts;
      }
      counts[result.failureCategory] =
        (counts[result.failureCategory] ?? 0) + 1;
      return counts;
    },
    {},
  );

  const manifestSummary = ManifestRunSummarySchema.parse({
    manifestPath: options.manifestPath,
    runDirectory,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    totalTasks: taskResults.length,
    passedTasks,
    failedTasks,
    taskResults: taskResults.map<ManifestRunTaskSummary>((result) => ({
      taskId: result.taskId,
      title: result.title,
      repositoryId: result.repositoryId,
      status: result.status,
      failureCategory: result.failureCategory,
      runResultPath: result.artifacts.runResultPath,
      reportPath: result.artifacts.reportPath,
    })),
    aggregatedMetrics,
    failureCategoryCounts,
  });

  fs.writeFileSync(
    path.join(runDirectory, SUMMARY_FILE_NAME),
    JSON.stringify(manifestSummary, null, 2),
  );

  return manifestSummary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.taskId) {
    const runResult = await runTask(options);
    process.stdout.write(JSON.stringify(runResult, null, 2) + '\n');
    if (runResult.status === 'failed') {
      process.exitCode = 1;
    }
    return;
  }

  const summary = await runManifest(options);
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  if (summary.failedTasks > 0) {
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
