/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'vitest';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { DEFAULT_GEMINI_MODEL, GEMINI_DIR } from '@google/gemini-cli-core';
import fs from 'node:fs';
import * as pty from '@lydell/node-pty';
import stripAnsi from 'strip-ansi';
import * as os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = join(__dirname, '..', '..', '..', 'bundle/gemini.js');

// Get timeout based on environment
export function getDefaultTimeout() {
  if (env['CI']) return 60000; // 1 minute in CI
  if (env['GEMINI_SANDBOX']) return 30000; // 30s in containers
  return 15000; // 15s locally
}

export async function poll(
  predicate: () => boolean,
  timeout: number,
  interval: number,
): Promise<boolean> {
  const startTime = Date.now();
  let attempts = 0;
  while (Date.now() - startTime < timeout) {
    attempts++;
    const result = predicate();
    if (env['VERBOSE'] === 'true' && attempts % 5 === 0) {
      console.log(
        `Poll attempt ${attempts}: ${result ? 'success' : 'waiting...'}`,
      );
    }
    if (result) {
      return true;
    }
    await sleep(interval);
  }
  if (env['VERBOSE'] === 'true') {
    console.log(`Poll timed out after ${attempts} attempts`);
  }
  return false;
}

export function sanitizeTestName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-');
}

// Helper to create detailed error messages
export function createToolCallErrorMessage(
  expectedTools: string | string[],
  foundTools: string[],
  result: string,
) {
  const expectedStr = Array.isArray(expectedTools)
    ? expectedTools.join(' or ')
    : expectedTools;
  return (
    `Expected to find ${expectedStr} tool call(s). ` +
    `Found: ${foundTools.length > 0 ? foundTools.join(', ') : 'none'}. ` +
    `Output preview: ${result ? result.substring(0, 200) + '...' : 'no output'}`
  );
}

// Helper to print debug information when tests fail
export function printDebugInfo(
  rig: TestRig,
  result: string,
  context: Record<string, unknown> = {},
) {
  console.error('Test failed - Debug info:');
  console.error('Result length:', result.length);
  console.error('Result (first 500 chars):', result.substring(0, 500));
  console.error(
    'Result (last 500 chars):',
    result.substring(result.length - 500),
  );

  // Print any additional context provided
  Object.entries(context).forEach(([key, value]) => {
    console.error(`${key}:`, value);
  });

  // Check what tools were actually called
  const allTools = rig.readToolLogs();
  console.error(
    'All tool calls found:',
    allTools.map((t) => t.toolRequest.name),
  );

  return allTools;
}

// Helper to assert that the model returned some output
export function assertModelHasOutput(result: string) {
  if (!result || result.trim().length === 0) {
    throw new Error('Expected LLM to return some output');
  }
}

function contentExists(result: string, content: string | RegExp): boolean {
  if (typeof content === 'string') {
    return result.toLowerCase().includes(content.toLowerCase());
  } else if (content instanceof RegExp) {
    return content.test(result);
  }
  return false;
}

function findMismatchedContent(
  result: string,
  content: string | (string | RegExp)[],
  shouldExist: boolean,
): (string | RegExp)[] {
  const contents = Array.isArray(content) ? content : [content];
  return contents.filter((c) => contentExists(result, c) !== shouldExist);
}

function logContentWarning(
  problematicContent: (string | RegExp)[],
  isMissing: boolean,
  originalContent: string | (string | RegExp)[] | null | undefined,
  result: string,
) {
  const message = isMissing
    ? 'LLM did not include expected content in response'
    : 'LLM included forbidden content in response';

  console.warn(
    `Warning: ${message}: ${problematicContent.join(', ')}.`,
    'This is not ideal but not a test failure.',
  );

  const label = isMissing ? 'Expected content' : 'Forbidden content';
  console.warn(`${label}:`, originalContent);
  console.warn('Actual output:', result);
}

// Helper to check model output and warn about unexpected content
export function checkModelOutputContent(
  result: string,
  {
    expectedContent = null,
    testName = '',
    forbiddenContent = null,
  }: {
    expectedContent?: string | (string | RegExp)[] | null;
    testName?: string;
    forbiddenContent?: string | (string | RegExp)[] | null;
  } = {},
): boolean {
  let isValid = true;

  // If expectedContent is provided, check for it and warn if missing
  if (expectedContent) {
    const missingContent = findMismatchedContent(result, expectedContent, true);

    if (missingContent.length > 0) {
      logContentWarning(missingContent, true, expectedContent, result);
      isValid = false;
    }
  }

  // If forbiddenContent is provided, check for it and warn if present
  if (forbiddenContent) {
    const foundContent = findMismatchedContent(result, forbiddenContent, false);

    if (foundContent.length > 0) {
      logContentWarning(foundContent, false, forbiddenContent, result);
      isValid = false;
    }
  }

  if (isValid && env['VERBOSE'] === 'true') {
    console.log(`${testName}: Model output content checked successfully.`);
  }

  return isValid;
}

export interface ParsedLog {
  attributes?: {
    'event.name'?: string;
    function_name?: string;
    function_args?: string;
    success?: boolean;
    duration_ms?: number;
    request_text?: string;
    hook_event_name?: string;
    hook_name?: string;
    hook_input?: Record<string, unknown>;
    hook_output?: Record<string, unknown>;
    exit_code?: number;
    stdout?: string;
    stderr?: string;
    error?: string;
    error_type?: string;
    prompt_id?: string;
  };
  scopeMetrics?: {
    metrics: {
      descriptor: {
        name: string;
      };
    }[];
  }[];
}

export class InteractiveRun {
  ptyProcess: pty.IPty;
  public output = '';

  constructor(ptyProcess: pty.IPty) {
    this.ptyProcess = ptyProcess;
    ptyProcess.onData((data) => {
      this.output += data;
      if (env['KEEP_OUTPUT'] === 'true' || env['VERBOSE'] === 'true') {
        process.stdout.write(data);
      }
    });
  }

  async expectText(text: string, timeout?: number) {
    if (!timeout) {
      timeout = getDefaultTimeout();
    }
    await poll(
      () => stripAnsi(this.output).toLowerCase().includes(text.toLowerCase()),
      timeout,
      200,
    );
    expect(stripAnsi(this.output).toLowerCase()).toContain(text.toLowerCase());
  }

  // This types slowly to make sure command is correct, but only work for short
  // commands that are not multi-line, use sendKeys to type long prompts
  async type(text: string) {
    let typedSoFar = '';
    for (const char of text) {
      if (char === '\r') {
        // wait >30ms before `enter` to avoid fast return conversion
        // from bufferFastReturn() in KeypressContent.tsx
        await sleep(50);
      }

      this.ptyProcess.write(char);
      typedSoFar += char;

      // Wait for the typed sequence so far to be echoed back.
      const found = await poll(
        () => stripAnsi(this.output).includes(typedSoFar),
        5000, // 5s timeout per character (generous for CI)
        10, // check frequently
      );

      if (!found) {
        throw new Error(
          `Timed out waiting for typed text to appear in output: "${typedSoFar}".\nStripped output:\n${stripAnsi(
            this.output,
          )}`,
        );
      }
    }
  }

  // Types an entire string at once, necessary for some things like commands
  // but may run into paste detection issues for larger strings.
  async sendText(text: string) {
    this.ptyProcess.write(text);
    await sleep(5);
  }

  // Simulates typing a string one character at a time to avoid paste detection.
  async sendKeys(text: string) {
    const delay = 5;
    for (const char of text) {
      this.ptyProcess.write(char);
      await sleep(delay);
    }
  }

  async kill() {
    this.ptyProcess.kill();
  }

  expectExit(): Promise<number> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(`Test timed out: process did not exit within a minute.`),
          ),
        60000,
      );
      this.ptyProcess.onExit(({ exitCode }) => {
        clearTimeout(timer);
        resolve(exitCode);
      });
    });
  }
}

function isObject(item: any): item is Record<string, any> {
  return !!(item && typeof item === 'object' && !Array.isArray(item));
}

function deepMerge(target: any, source: any): any {
  if (!isObject(target) || !isObject(source)) {
    return source;
  }
  const output = { ...target };
  Object.keys(source).forEach((key) => {
    const targetValue = target[key];
    const sourceValue = source[key];
    if (isObject(targetValue) && isObject(sourceValue)) {
      output[key] = deepMerge(targetValue, sourceValue);
    } else {
      output[key] = sourceValue;
    }
  });
  return output;
}

export class TestRig {
  testDir: string | null = null;
  homeDir: string | null = null;
  testName?: string;
  _lastRunStdout?: string;
  _lastRunStderr?: string;
  // Path to the copied fake responses file for this test.
  fakeResponsesPath?: string;
  // Original fake responses file path for rewriting goldens in record mode.
  originalFakeResponsesPath?: string;
  private _interactiveRuns: InteractiveRun[] = [];
  private _spawnedProcesses: ChildProcess[] = [];
  private _initialized = false;

  setup(
    testName: string,
    options: {
      settings?: Record<string, unknown>;
      fakeResponsesPath?: string;
    } = {},
  ) {
    this.testName = testName;
    const sanitizedName = sanitizeTestName(testName);
    const testFileDir =
      env['INTEGRATION_TEST_FILE_DIR'] || join(os.tmpdir(), 'gemini-cli-tests');
    this.testDir = join(testFileDir, sanitizedName);
    this.homeDir = join(testFileDir, sanitizedName + '-home');

    if (!this._initialized) {
      // Clean up existing directories from previous runs (e.g. retries)
      this._cleanDir(this.testDir);
      this._cleanDir(this.homeDir);
      this._initialized = true;
    }

    mkdirSync(this.testDir, { recursive: true });
    mkdirSync(this.homeDir, { recursive: true });
    if (options.fakeResponsesPath) {
      this.fakeResponsesPath = join(this.testDir, 'fake-responses.json');
      this.originalFakeResponsesPath = options.fakeResponsesPath;
      if (process.env['REGENERATE_MODEL_GOLDENS'] !== 'true') {
        fs.copyFileSync(options.fakeResponsesPath, this.fakeResponsesPath);
      }
    }

    // Create a settings file to point the CLI to the local collector
    this._createSettingsFile(options.settings);
  }

  private _cleanDir(dir: string) {
    if (fs.existsSync(dir)) {
      for (let i = 0; i < 10; i++) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          return;
        } catch (err) {
          if (i === 9) {
            console.error(
              `Failed to clean directory ${dir} after 10 attempts:`,
              err,
            );
            throw err;
          }
          const delay = Math.min(Math.pow(2, i) * 1000, 10000); // Max 10s delay
          try {
            const sharedBuffer = new Int32Array(new SharedArrayBuffer(4));
            Atomics.wait(sharedBuffer, 0, 0, delay);
          } catch {
            // Fallback for environments where SharedArrayBuffer might be restricted
            const start = Date.now();
            while (Date.now() - start < delay) {
              /* busy wait */
            }
          }
        }
      }
    }
  }

  private _createSettingsFile(overrideSettings?: Record<string, unknown>) {
    const projectGeminiDir = join(this.testDir!, GEMINI_DIR);
    mkdirSync(projectGeminiDir, { recursive: true });

    const userGeminiDir = join(this.homeDir!, GEMINI_DIR);
    mkdirSync(userGeminiDir, { recursive: true });

    // In sandbox mode, use an absolute path for telemetry inside the container
    // The container mounts the test directory at the same path as the host
    const telemetryPath = join(this.homeDir!, 'telemetry.log'); // Always use home directory for telemetry

    const settings = deepMerge(
      {
        general: {
          // Nightly releases sometimes becomes out of sync with local code and
          // triggers auto-update, which causes tests to fail.
          disableAutoUpdate: true,
        },
        telemetry: {
          enabled: true,
          target: 'local',
          otlpEndpoint: '',
          outfile: telemetryPath,
        },
        security: {
          auth: {
            selectedType: 'gemini-api-key',
          },
          folderTrust: {
            enabled: false,
          },
        },
        ui: {
          useAlternateBuffer: true,
        },
        ...(env['GEMINI_TEST_TYPE'] === 'integration'
          ? {
              model: {
                name: DEFAULT_GEMINI_MODEL,
              },
            }
          : {}),
        sandbox:
          env['GEMINI_SANDBOX'] !== 'false' ? env['GEMINI_SANDBOX'] : false,
        // Don't show the IDE connection dialog when running from VsCode
        ide: { enabled: false, hasSeenNudge: true },
      },
      overrideSettings ?? {},
    );
    writeFileSync(
      join(projectGeminiDir, 'settings.json'),
      JSON.stringify(settings, null, 2),
    );
    writeFileSync(
      join(userGeminiDir, 'settings.json'),
      JSON.stringify(settings, null, 2),
    );
  }

  createFile(fileName: string, content: string) {
    const filePath = join(this.testDir!, fileName);
    writeFileSync(filePath, content);
    return filePath;
  }

  mkdir(dir: string) {
    mkdirSync(join(this.testDir!, dir), { recursive: true });
  }

  sync() {
    if (os.platform() === 'win32') return;
    // ensure file system is done before spawning
    execSync('sync', { cwd: this.testDir! });
  }

  /**
   * The command and args to use to invoke Gemini CLI. Allows us to switch
   * between using the bundled gemini.js (the default) and using the installed
   * 'gemini' (used to verify npm bundles).
   */
  private _getCommandAndArgs(extraInitialArgs: string[] = []): {
    command: string;
    initialArgs: string[];
  } {
    const isNpmReleaseTest =
      env['INTEGRATION_TEST_USE_INSTALLED_GEMINI'] === 'true';
    const geminiCommand = os.platform() === 'win32' ? 'gemini.cmd' : 'gemini';
    const command = isNpmReleaseTest ? geminiCommand : 'node';
    const initialArgs = isNpmReleaseTest
      ? extraInitialArgs
      : [BUNDLE_PATH, ...extraInitialArgs];
    if (this.fakeResponsesPath) {
      if (process.env['REGENERATE_MODEL_GOLDENS'] === 'true') {
        initialArgs.push('--record-responses', this.fakeResponsesPath);
      } else {
        initialArgs.push('--fake-responses', this.fakeResponsesPath);
      }
    }
    return { command, initialArgs };
  }

  createScript(fileName: string, content: string) {
    if (!this.testDir) {
      throw new Error(
        'TestRig.setup must be called before creating files or scripts',
      );
    }
    const scriptPath = join(this.testDir, fileName);
    writeFileSync(scriptPath, content);
    return normalizePath(scriptPath);
  }

  private _getCleanEnv(
    extraEnv?: Record<string, string | undefined>,
  ): Record<string, string | undefined> {
    const cleanEnv: Record<string, string | undefined> = { ...process.env };

    // Clear all GEMINI_ environment variables that might interfere with tests
    // except for those we explicitly want to keep or set.
    for (const key of Object.keys(cleanEnv)) {
      if (
        (key.startsWith('GEMINI_') || key.startsWith('GOOGLE_GEMINI_')) &&
        key !== 'GEMINI_API_KEY' &&
        key !== 'GOOGLE_API_KEY' &&
        key !== 'GEMINI_MODEL' &&
        key !== 'GEMINI_DEBUG' &&
        key !== 'GEMINI_CLI_TEST_VAR' &&
        key !== 'GEMINI_CLI_INTEGRATION_TEST' &&
        !key.startsWith('GEMINI_CLI_ACTIVITY_LOG')
      ) {
        delete cleanEnv[key];
      }
    }

    return {
      ...cleanEnv,
      GEMINI_CLI_HOME: this.homeDir!,
      GEMINI_PTY_INFO: 'child_process',
      ...extraEnv,
    };
  }

  run(options: {
    args?: string | string[];
    stdin?: string;
    stdinDoesNotEnd?: boolean;
    approvalMode?: 'default' | 'auto_edit' | 'yolo' | 'plan';
    timeout?: number;
    env?: Record<string, string | undefined>;
  }): Promise<string> {
    const approvalMode = options.approvalMode ?? 'yolo';
    const { command, initialArgs } = this._getCommandAndArgs([
      `--approval-mode=${approvalMode}`,
    ]);
    const commandArgs = [...initialArgs];
    const execOptions: {
      cwd: string;
      encoding: 'utf-8';
      input?: string;
    } = {
      cwd: this.testDir!,
      encoding: 'utf-8',
    };

    if (options.args) {
      if (Array.isArray(options.args)) {
        commandArgs.push(...options.args);
      } else {
        commandArgs.push(options.args);
      }
    }

    if (options.stdin) {
      execOptions.input = options.stdin;
    }

    const child = spawn(command, commandArgs, {
      cwd: this.testDir!,
      stdio: 'pipe',
      env: this._getCleanEnv(options.env),
    });
    this._spawnedProcesses.push(child);

    let stdout = '';
    let stderr = '';

    // Handle stdin if provided
    if (execOptions.input) {
      child.stdin!.write(execOptions.input);
    }

    if (!options.stdinDoesNotEnd) {
      child.stdin!.end();
    }

    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (data: string) => {
      stdout += data;
      if (env['KEEP_OUTPUT'] === 'true' || env['VERBOSE'] === 'true') {
        process.stdout.write(data);
      }
    });

    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (data: string) => {
      stderr += data;
      if (env['KEEP_OUTPUT'] === 'true' || env['VERBOSE'] === 'true') {
        process.stderr.write(data);
      }
    });

    const timeout = options.timeout ?? 300000;
    const promise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          new Error(
            `Process timed out after ${timeout}ms.\nStdout:\n${stdout}\nStderr:\n${stderr}`,
          ),
        );
      }, timeout);

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code: number) => {
        clearTimeout(timer);
        this._lastRunStderr = stderr;
        if (code === 0) {
          // Store the raw stdout for Podman telemetry parsing
          this._lastRunStdout = stdout;

          // Filter out telemetry output when running with Podman
          const result = this._filterPodmanTelemetry(stdout);

          // Check if this is a JSON output test - if so, don't include stderr
          // as it would corrupt the JSON
          const isJsonOutput =
            commandArgs.includes('--output-format') &&
            commandArgs.includes('json');

          // If we have stderr output and it's not a JSON test, include that also
          const finalResult =
            stderr && !isJsonOutput
              ? `${result}\n\nStdErr:\n${stderr}`
              : result;

          resolve(finalResult);
        } else {
          reject(new Error(`Process exited with code ${code}:\n${stderr}`));
        }
      });
    });

    return promise;
  }

  private _filterPodmanTelemetry(stdout: string): string {
    if (env['GEMINI_SANDBOX'] !== 'podman') {
      return stdout;
    }

    // Remove telemetry JSON objects from output
    // They are multi-line JSON objects that start with { and contain telemetry fields
    const lines = stdout.split(os.EOL);
    const filteredLines = [];
    let inTelemetryObject = false;
    let braceDepth = 0;

    for (const line of lines) {
      if (!inTelemetryObject && line.trim() === '{') {
        // Check if this might be start of telemetry object
        inTelemetryObject = true;
        braceDepth = 1;
      } else if (inTelemetryObject) {
        // Count braces to track nesting
        for (const char of line) {
          if (char === '{') braceDepth++;
          else if (char === '}') braceDepth--;
        }

        // Check if we've closed all braces
        if (braceDepth === 0) {
          inTelemetryObject = false;
          // Skip this line (the closing brace)
          continue;
        }
      } else {
        // Not in telemetry object, keep the line
        filteredLines.push(line);
      }
    }

    return filteredLines.join('\n');
  }

  /**
   * Runs the CLI and returns stdout and stderr separately.
   * Useful for tests that need to verify correct stream routing.
   */
  runWithStreams(
    args: string[],
    options?: { signal?: AbortSignal },
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
      const { command, initialArgs } = this._getCommandAndArgs([
        '--approval-mode=yolo',
      ]);

      const allArgs = [...initialArgs, ...args];

      const child = spawn(command, allArgs, {
        cwd: this.testDir!,
        stdio: 'pipe',
        env: this._getCleanEnv(),
        signal: options?.signal,
      });
      this._spawnedProcesses.push(child);

      let stdout = '';
      let stderr = '';

      child.on('error', reject);

      child.stdout!.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr!.on('data', (chunk) => {
        stderr += chunk;
      });

      child.stdin!.end();
      child.on('close', (exitCode) => {
        resolve({ stdout, stderr, exitCode });
      });
    });
  }

  runCommand(
    args: string[],
    options: {
      stdin?: string;
      timeout?: number;
      env?: Record<string, string | undefined>;
    } = {},
  ): Promise<string> {
    const { command, initialArgs } = this._getCommandAndArgs();
    const commandArgs = [...initialArgs, ...args];

    const child = spawn(command, commandArgs, {
      cwd: this.testDir!,
      stdio: 'pipe',
      env: this._getCleanEnv(options.env),
    });
    this._spawnedProcesses.push(child);

    let stdout = '';
    let stderr = '';

    if (options.stdin) {
      child.stdin!.write(options.stdin);
      child.stdin!.end();
    }

    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (data: string) => {
      stdout += data;
      if (env['KEEP_OUTPUT'] === 'true' || env['VERBOSE'] === 'true') {
        process.stdout.write(data);
      }
    });

    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (data: string) => {
      stderr += data;
      if (env['KEEP_OUTPUT'] === 'true' || env['VERBOSE'] === 'true') {
        process.stderr.write(data);
      }
    });

    const timeout = options.timeout ?? 300000;
    const promise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          new Error(
            `Process timed out after ${timeout}ms.\nStdout:\n${stdout}\nStderr:\n${stderr}`,
          ),
        );
      }, timeout);

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code: number) => {
        clearTimeout(timer);
        this._lastRunStderr = stderr;
        if (code === 0) {
          this._lastRunStdout = stdout;
          const result = this._filterPodmanTelemetry(stdout);

          // Check if this is a JSON output test - if so, don't include stderr
          // as it would corrupt the JSON
          const isJsonOutput =
            commandArgs.includes('--output-format') &&
            commandArgs.includes('json');

          const finalResult =
            stderr && !isJsonOutput
              ? `${result}\n\nStdErr:\n${stderr}`
              : result;
          resolve(finalResult);
        } else {
          reject(new Error(`Process exited with code ${code}:\n${stderr}`));
        }
      });
    });

    return promise;
  }

  readFile(fileName: string) {
    const filePath = join(this.testDir!, fileName);
    const content = readFileSync(filePath, 'utf-8');
    if (env['KEEP_OUTPUT'] === 'true' || env['VERBOSE'] === 'true') {
      console.log(`--- FILE: ${filePath} ---`);
      console.log(content);
      console.log(`--- END FILE: ${filePath} ---`);
    }
    return content;
  }

  async cleanup() {
    // Kill any interactive runs that are still active
    for (const run of this._interactiveRuns) {
      try {
        if (process.platform === 'win32') {
          // @ts-ignore - access private ptyProcess
          const pid = run.ptyProcess?.pid;
          if (pid) {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
          }
        }
        await run.kill();
      } catch (error) {
        if (env['VERBOSE'] === 'true') {
          console.warn('Failed to kill interactive run during cleanup:', error);
        }
      }
    }
    this._interactiveRuns = [];

    // Kill any other spawned processes that are still running
    for (const child of this._spawnedProcesses) {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          if (process.platform === 'win32' && child.pid) {
            execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' });
          }
          child.kill('SIGKILL');
        } catch (error) {
          if (env['VERBOSE'] === 'true') {
            console.warn(
              'Failed to kill spawned process during cleanup:',
              error,
            );
          }
        }
      }
    }
    this._spawnedProcesses = [];

    if (
      process.env['REGENERATE_MODEL_GOLDENS'] === 'true' &&
      this.fakeResponsesPath
    ) {
      fs.copyFileSync(this.fakeResponsesPath, this.originalFakeResponsesPath!);
    }
    // Clean up test directory and home directory
    if (this.testDir && !env['KEEP_OUTPUT']) {
      try {
        this._cleanDir(this.testDir);
      } catch (error) {
        // Ignore cleanup errors
        if (env['VERBOSE'] === 'true' || env['CI'] === 'true') {
          console.warn('Cleanup warning (testDir):', (error as Error).message);
        }
      }
    }
    if (this.homeDir && !env['KEEP_OUTPUT']) {
      try {
        this._cleanDir(this.homeDir);
      } catch (error) {
        // Ignore cleanup errors
        if (env['VERBOSE'] === 'true' || env['CI'] === 'true') {
          console.warn('Cleanup warning (homeDir):', (error as Error).message);
        }
      }
    }
  }

  async waitForTelemetryReady() {
    // Telemetry is always written to the test directory
    const logFilePath = join(this.homeDir!, 'telemetry.log');

    if (!logFilePath) return;

    // Wait for telemetry file to exist and have content
    await poll(
      () => {
        if (!fs.existsSync(logFilePath)) return false;
        try {
          const content = readFileSync(logFilePath, 'utf-8');
          // Check if file has meaningful content (at least one complete JSON object)
          return content.includes('"scopeMetrics"');
        } catch {
          return false;
        }
      },
      2000, // 2 seconds max - reduced since telemetry should flush on exit now
      100, // check every 100ms
    );
  }

  async waitForTelemetryEvent(eventName: string, timeout?: number) {
    if (!timeout) {
      timeout = getDefaultTimeout();
    }

    await this.waitForTelemetryReady();

    return poll(
      () => {
        const logs = this._readAndParseTelemetryLog();
        return logs.some(
          (logData) =>
            logData.attributes &&
            logData.attributes['event.name'] === `gemini_cli.${eventName}`,
        );
      },
      timeout,
      100,
    );
  }

  async waitForToolCall(
    toolName: string,
    timeout?: number,
    matchArgs?: (args: string) => boolean,
  ) {
    // Use environment-specific timeout
    if (!timeout) {
      timeout = getDefaultTimeout();
    }

    // Wait for telemetry to be ready before polling for tool calls
    await this.waitForTelemetryReady();

    return poll(
      () => {
        const toolLogs = this.readToolLogs();
        return toolLogs.some(
          (log) =>
            log.toolRequest.name === toolName &&
            (matchArgs?.call(this, log.toolRequest.args) ?? true),
        );
      },
      timeout,
      100,
    );
  }

  async expectToolCallSuccess(
    toolNames: string[],
    timeout?: number,
    matchArgs?: (args: string) => boolean,
  ) {
    // Use environment-specific timeout
    if (!timeout) {
      timeout = getDefaultTimeout();
    }

    // Wait for telemetry to be ready before polling for tool calls
    await this.waitForTelemetryReady();

    const success = await poll(
      () => {
        const toolLogs = this.readToolLogs();
        return toolNames.some((name) =>
          toolLogs.some(
            (log) =>
              log.toolRequest.name === name &&
              log.toolRequest.success &&
              (matchArgs?.call(this, log.toolRequest.args) ?? true),
          ),
        );
      },
      timeout,
      100,
    );

    expect(
      success,
      `Expected to find successful toolCalls for ${JSON.stringify(toolNames)}`,
    ).toBe(true);
  }

  async waitForAnyToolCall(toolNames: string[], timeout?: number) {
    if (!timeout) {
      timeout = getDefaultTimeout();
    }

    // Wait for telemetry to be ready before polling for tool calls
    await this.waitForTelemetryReady();

    return poll(
      () => {
        const toolLogs = this.readToolLogs();
        return toolNames.some((name) =>
          toolLogs.some((log) => log.toolRequest.name === name),
        );
      },
      timeout,
      100,
    );
  }

  _parseToolLogsFromStdout(stdout: string) {
    const logs: {
      timestamp: number;
      toolRequest: {
        name: string;
        args: string;
        success: boolean;
        duration_ms: number;
        prompt_id?: string;
      };
    }[] = [];

    // The console output from Podman is JavaScript object notation, not JSON
    // Look for tool call events in the output
    // Updated regex to handle tool names with hyphens and underscores
    const toolCallPattern =
      /body:\s*'Tool call:\s*([\w-]+)\..*?Success:\s*(\w+)\..*?Duration:\s*(\d+)ms\.'/g;
    const matches = [...stdout.matchAll(toolCallPattern)];

    for (const match of matches) {
      const toolName = match[1];
      const success = match[2] === 'true';
      const duration = parseInt(match[3], 10);

      // Try to find function_args nearby
      const matchIndex = match.index || 0;
      const contextStart = Math.max(0, matchIndex - 500);
      const contextEnd = Math.min(stdout.length, matchIndex + 500);
      const context = stdout.substring(contextStart, contextEnd);

      // Look for function_args in the context
      let args = '{}';
      const argsMatch = context.match(/function_args:\s*'([^']+)'/);
      if (argsMatch) {
        args = argsMatch[1];
      }

      // Look for prompt_id in the context
      let promptId = undefined;
      const promptIdMatch = context.match(/prompt_id:\s*'([^']+)'/);
      if (promptIdMatch) {
        promptId = promptIdMatch[1];
      }

      // Also try to find function_name to double-check
      // Updated regex to handle tool names with hyphens and underscores
      const nameMatch = context.match(/function_name:\s*'([\w-]+)'/);
      const actualToolName = nameMatch ? nameMatch[1] : toolName;

      logs.push({
        timestamp: Date.now(),
        toolRequest: {
          name: actualToolName,
          args: args,
          success: success,
          duration_ms: duration,
          prompt_id: promptId,
        },
      });
    }

    // If no matches found with the simple pattern, try the JSON parsing approach
    // in case the format changes
    if (logs.length === 0) {
      const lines = stdout.split(os.EOL);
      let currentObject = '';
      let inObject = false;
      let braceDepth = 0;

      for (const line of lines) {
        if (!inObject && line.trim() === '{') {
          inObject = true;
          braceDepth = 1;
          currentObject = line + '\n';
        } else if (inObject) {
          currentObject += line + '\n';

          // Count braces
          for (const char of line) {
            if (char === '{') braceDepth++;
            else if (char === '}') braceDepth--;
          }

          // If we've closed all braces, try to parse the object
          if (braceDepth === 0) {
            inObject = false;
            try {
              const obj = JSON.parse(currentObject);

              // Check for tool call in different formats
              if (
                obj.body &&
                obj.body.includes('Tool call:') &&
                obj.attributes
              ) {
                const bodyMatch = obj.body.match(/Tool call: (\w+)\./);
                if (bodyMatch) {
                  logs.push({
                    timestamp: obj.timestamp || Date.now(),
                    toolRequest: {
                      name: bodyMatch[1],
                      args: obj.attributes.function_args || '{}',
                      success: obj.attributes.success !== false,
                      duration_ms: obj.attributes.duration_ms || 0,
                      prompt_id: obj.attributes.prompt_id,
                    },
                  });
                }
              } else if (
                obj.attributes &&
                obj.attributes['event.name'] === 'gemini_cli.tool_call'
              ) {
                logs.push({
                  timestamp: obj.attributes['event.timestamp'],
                  toolRequest: {
                    name: obj.attributes.function_name,
                    args: obj.attributes.function_args,
                    success: obj.attributes.success,
                    duration_ms: obj.attributes.duration_ms,
                    prompt_id: obj.attributes.prompt_id,
                  },
                });
              }
            } catch {
              // Not valid JSON
            }
            currentObject = '';
          }
        }
      }
    }

    return logs;
  }

  private _readAndParseTelemetryLog(): ParsedLog[] {
    // Telemetry is always written to the test directory
    const logFilePath = join(this.homeDir!, 'telemetry.log');

    if (!logFilePath || !fs.existsSync(logFilePath)) {
      return [];
    }

    const content = readFileSync(logFilePath, 'utf-8');

    // Split the content into individual JSON objects
    // They are separated by "}\n{"
    const jsonObjects = content
      .split(/}\n{/)
      .map((obj, index, array) => {
        // Add back the braces we removed during split
        if (index > 0) obj = '{' + obj;
        if (index < array.length - 1) obj = obj + '}';
        return obj.trim();
      })
      .filter((obj) => obj);

    const logs: ParsedLog[] = [];

    for (const jsonStr of jsonObjects) {
      try {
        const logData = JSON.parse(jsonStr);
        logs.push(logData);
      } catch (e) {
        // Skip objects that aren't valid JSON
        if (env['VERBOSE'] === 'true') {
          console.error('Failed to parse telemetry object:', e);
        }
      }
    }

    return logs;
  }

  readToolLogs() {
    // For Podman, first check if telemetry file exists and has content
    // If not, fall back to parsing from stdout
    if (env['GEMINI_SANDBOX'] === 'podman') {
      // Try reading from file first
      const logFilePath = join(this.homeDir!, 'telemetry.log');

      if (fs.existsSync(logFilePath)) {
        try {
          const content = readFileSync(logFilePath, 'utf-8');
          if (content && content.includes('"event.name"')) {
            // File has content, use normal file parsing
            // Continue to the normal file parsing logic below
          } else if (this._lastRunStdout) {
            // File exists but is empty or doesn't have events, parse from stdout
            return this._parseToolLogsFromStdout(this._lastRunStdout);
          }
        } catch {
          // Error reading file, fall back to stdout
          if (this._lastRunStdout) {
            return this._parseToolLogsFromStdout(this._lastRunStdout);
          }
        }
      } else if (this._lastRunStdout) {
        // No file exists, parse from stdout
        return this._parseToolLogsFromStdout(this._lastRunStdout);
      }
    }

    const parsedLogs = this._readAndParseTelemetryLog();
    const logs: {
      toolRequest: {
        name: string;
        args: string;
        success: boolean;
        duration_ms: number;
        prompt_id?: string;
        error?: string;
        error_type?: string;
      };
    }[] = [];

    for (const logData of parsedLogs) {
      // Look for tool call logs
      if (
        logData.attributes &&
        logData.attributes['event.name'] === 'gemini_cli.tool_call'
      ) {
        const toolName = logData.attributes.function_name!;
        logs.push({
          toolRequest: {
            name: toolName,
            args: logData.attributes.function_args ?? '{}',
            success: logData.attributes.success ?? false,
            duration_ms: logData.attributes.duration_ms ?? 0,
            prompt_id: logData.attributes.prompt_id,
            error: logData.attributes.error,
            error_type: logData.attributes.error_type,
          },
        });
      }
    }

    return logs;
  }

  readAllApiRequest(): ParsedLog[] {
    const logs = this._readAndParseTelemetryLog();
    const apiRequests = logs.filter(
      (logData) =>
        logData.attributes &&
        logData.attributes['event.name'] === `gemini_cli.api_request`,
    );
    return apiRequests;
  }

  readLastApiRequest(): ParsedLog | null {
    const logs = this._readAndParseTelemetryLog();
    const apiRequests = logs.filter(
      (logData) =>
        logData.attributes &&
        logData.attributes['event.name'] === `gemini_cli.api_request`,
    );
    return apiRequests.pop() || null;
  }

  async waitForMetric(metricName: string, timeout?: number) {
    await this.waitForTelemetryReady();

    const fullName = metricName.startsWith('gemini_cli.')
      ? metricName
      : `gemini_cli.${metricName}`;

    return poll(
      () => {
        const logs = this._readAndParseTelemetryLog();
        for (const logData of logs) {
          if (logData.scopeMetrics) {
            for (const scopeMetric of logData.scopeMetrics) {
              for (const metric of scopeMetric.metrics) {
                if (metric.descriptor.name === fullName) {
                  return true;
                }
              }
            }
          }
        }
        return false;
      },
      timeout ?? getDefaultTimeout(),
      100,
    );
  }

  readMetric(metricName: string): Record<string, unknown> | null {
    const logs = this._readAndParseTelemetryLog();
    for (const logData of logs) {
      if (logData.scopeMetrics) {
        for (const scopeMetric of logData.scopeMetrics) {
          for (const metric of scopeMetric.metrics) {
            if (metric.descriptor.name === `gemini_cli.${metricName}`) {
              return metric;
            }
          }
        }
      }
    }
    return null;
  }

  async runInteractive(options?: {
    args?: string | string[];
    approvalMode?: 'default' | 'auto_edit' | 'yolo' | 'plan';
    env?: Record<string, string | undefined>;
  }): Promise<InteractiveRun> {
    const approvalMode = options?.approvalMode ?? 'yolo';
    const { command, initialArgs } = this._getCommandAndArgs([
      `--approval-mode=${approvalMode}`,
    ]);
    const commandArgs = [...initialArgs];

    const envVars = this._getCleanEnv(options?.env);

    // node-pty on windows often needs these to spawn correctly
    if (process.platform === 'win32') {
      const windowsCriticalVars = [
        'SystemRoot',
        'COMSPEC',
        'windir',
        'PATHEXT',
        'TEMP',
        'TMP',
      ];
      for (const v of windowsCriticalVars) {
        if (process.env[v] && !envVars[v]) {
          envVars[v] = process.env[v]!;
        }
      }
    }

    const ptyOptions: pty.IPtyForkOptions = {
      name: 'xterm-color',
      cols: 80,
      rows: 80,
      cwd: this.testDir!,
      env: Object.fromEntries(
        Object.entries(envVars).filter(([, v]) => v !== undefined),
      ) as { [key: string]: string },
    };

    const executable = command === 'node' ? process.execPath : command;
    const ptyProcess = pty.spawn(executable, commandArgs, ptyOptions);

    const run = new InteractiveRun(ptyProcess);
    this._interactiveRuns.push(run);
    // Wait for the app to be ready
    await run.expectText('  Type your message or @path/to/file', 30000);
    return run;
  }

  readHookLogs() {
    const parsedLogs = this._readAndParseTelemetryLog();
    const logs: {
      hookCall: {
        hook_event_name: string;
        hook_name: string;
        hook_input: Record<string, unknown>;
        hook_output: Record<string, unknown>;
        exit_code: number;
        stdout: string;
        stderr: string;
        duration_ms: number;
        success: boolean;
        error: string;
      };
    }[] = [];

    for (const logData of parsedLogs) {
      // Look for tool call logs
      if (
        logData.attributes &&
        logData.attributes['event.name'] === 'gemini_cli.hook_call'
      ) {
        logs.push({
          hookCall: {
            hook_event_name: logData.attributes.hook_event_name ?? '',
            hook_name: logData.attributes.hook_name ?? '',
            hook_input: logData.attributes.hook_input ?? {},
            hook_output: logData.attributes.hook_output ?? {},
            exit_code: logData.attributes.exit_code ?? 0,
            stdout: logData.attributes.stdout ?? '',
            stderr: logData.attributes.stderr ?? '',
            duration_ms: logData.attributes.duration_ms ?? 0,
            success: logData.attributes.success ?? false,
            error: logData.attributes.error ?? '',
          },
        });
      }
    }

    return logs;
  }

  async pollCommand(
    commandFn: () => Promise<void>,
    predicateFn: () => boolean,
    timeout: number = 30000,
    interval: number = 1000,
  ) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      await commandFn();
      // Give it a moment to process
      await sleep(500);
      if (predicateFn()) {
        return;
      }
      await sleep(interval);
    }
    throw new Error(`pollCommand timed out after ${timeout}ms`);
  }
}

/**
 * Normalizes a path for cross-platform matching (replaces backslashes with forward slashes).
 */
export function normalizePath(p: string | undefined): string | undefined {
  if (!p) return p;
  return p.replace(/\\/g, '/');
}
