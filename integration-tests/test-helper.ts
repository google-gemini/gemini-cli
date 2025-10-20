/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from 'node:process';
import { DEFAULT_GEMINI_MODEL } from '../packages/core/src/config/models.js';
import fs from 'node:fs';
import * as pty from '@lydell/node-pty';
import stripAnsi from 'strip-ansi';
import * as os from 'node:os';
import { GEMINI_DIR } from '../packages/core/src/utils/paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get timeout based on environment
function getDefaultTimeout() {
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
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  if (env['VERBOSE'] === 'true') {
    console.log(`Poll timed out after ${attempts} attempts`);
  }
  return false;
}

function sanitizeTestName(name: string) {
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

// Helper to validate model output and warn about unexpected content
export function validateModelOutput(
  result: string,
  expectedContent: string | (string | RegExp)[] | null = null,
  testName = '',
) {
  // First, check if there's any output at all (this should fail the test if missing)
  if (!result || result.trim().length === 0) {
    throw new Error('Expected LLM to return some output');
  }

  // If expectedContent is provided, check for it and warn if missing
  if (expectedContent) {
    const contents = Array.isArray(expectedContent)
      ? expectedContent
      : [expectedContent];
    const missingContent = contents.filter((content) => {
      if (typeof content === 'string') {
        return !result.toLowerCase().includes(content.toLowerCase());
      } else if (content instanceof RegExp) {
        return !content.test(result);
      }
      return false;
    });

    if (missingContent.length > 0) {
      console.warn(
        `Warning: LLM did not include expected content in response: ${missingContent.join(
          ', ',
        )}.`,
        'This is not ideal but not a test failure.',
      );
      console.warn(
        'The tool was called successfully, which is the main requirement.',
      );
      console.warn('Expected content:', expectedContent);
      console.warn('Actual output:', result);
      return false;
    } else if (env['VERBOSE'] === 'true') {
      console.log(`${testName}: Model output validated successfully.`);
    }
    return true;
  }

  return true;
}

interface ParsedLog {
  attributes?: {
    'event.name'?: string;
    function_name?: string;
    function_args?: string;
    success?: boolean;
    duration_ms?: number;
    request_text?: string;
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
    const found = await poll(
      () => stripAnsi(this.output).toLowerCase().includes(text.toLowerCase()),
      timeout,
      200,
    );
    expect(found, `Did not find expected text: "${text}"`).toBe(true);
  }

  // This types slowly to make sure command is correct, but only work for short
  // commands that are not multi-line, use sendKeys to type long prompts
  async type(text: string) {
    let typedSoFar = '';
    for (const char of text) {
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

  // Simulates typing a string one character at a time to avoid paste detection.
  async sendKeys(text: string) {
    const delay = 5;
    for (const char of text) {
      this.ptyProcess.write(char);
      await new Promise((resolve) => setTimeout(resolve, delay));
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

export class TestRig {
  bundlePath: string;
  testDir: string | null;
  testName?: string;
  _lastRunStdout?: string;

  constructor() {
    this.bundlePath = join(__dirname, '..', 'bundle/gemini.js');
    this.testDir = null;
  }

  setup(
    testName: string,
    options: { settings?: Record<string, unknown> } = {},
  ) {
    this.testName = testName;
    const sanitizedName = sanitizeTestName(testName);
    this.testDir = join(env['INTEGRATION_TEST_FILE_DIR']!, sanitizedName);
    mkdirSync(this.testDir, { recursive: true });

    // Create a settings file to point the CLI to the local collector
    const geminiDir = join(this.testDir, GEMINI_DIR);
    mkdirSync(geminiDir, { recursive: true });
    // In sandbox mode, use an absolute path for telemetry inside the container
    // The container mounts the test directory at the same path as the host
    const telemetryPath = join(this.testDir, 'telemetry.log'); // Always use test directory for telemetry

    const settings = {
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
      },
      model: DEFAULT_GEMINI_MODEL,
      sandbox:
        env['GEMINI_SANDBOX'] !== 'false' ? env['GEMINI_SANDBOX'] : false,
      ...options.settings, // Allow tests to override/add settings
    };
    writeFileSync(
      join(geminiDir, 'settings.json'),
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
    const command = isNpmReleaseTest ? 'gemini' : 'node';
    const initialArgs = isNpmReleaseTest
      ? extraInitialArgs
      : [this.bundlePath, ...extraInitialArgs];
    return { command, initialArgs };
  }

  run(
    promptOrOptions:
      | string
      | {
          prompt?: string;
          stdin?: string;
          stdinDoesNotEnd?: boolean;
          yolo?: boolean;
        },
    ...args: string[]
  ): Promise<string> {
    const yolo =
      typeof promptOrOptions === 'string' || promptOrOptions.yolo !== false;
    const { command, initialArgs } = this._getCommandAndArgs(
      yolo ? ['--yolo'] : [],
    );
    const commandArgs = [...initialArgs];
    const execOptions: {
      cwd: string;
      encoding: 'utf-8';
      input?: string;
    } = {
      cwd: this.testDir!,
      encoding: 'utf-8',
    };

    if (typeof promptOrOptions === 'string') {
      commandArgs.push('--prompt', promptOrOptions);
    } else if (
      typeof promptOrOptions === 'object' &&
      promptOrOptions !== null
    ) {
      if (promptOrOptions.prompt) {
        commandArgs.push('--prompt', promptOrOptions.prompt);
      }
      if (promptOrOptions.stdin) {
        execOptions.input = promptOrOptions.stdin;
      }
    }

    commandArgs.push(...args);

    const child = spawn(command, commandArgs, {
      cwd: this.testDir!,
      stdio: 'pipe',
      env: env,
    });

    let stdout = '';
    let stderr = '';

    // Handle stdin if provided
    if (execOptions.input) {
      child.stdin!.write(execOptions.input);
    }

    if (
      typeof promptOrOptions === 'object' &&
      !promptOrOptions.stdinDoesNotEnd
    ) {
      child.stdin!.end();
    }

    child.stdout!.on('data', (data: Buffer) => {
      stdout += data;
      if (env['KEEP_OUTPUT'] === 'true' || env['VERBOSE'] === 'true') {
        process.stdout.write(data);
      }
    });

    child.stderr!.on('data', (data: Buffer) => {
      stderr += data;
      if (env['KEEP_OUTPUT'] === 'true' || env['VERBOSE'] === 'true') {
        process.stderr.write(data);
      }
    });

    const promise = new Promise<string>((resolve, reject) => {
      child.on('close', (code: number) => {
        if (code === 0) {
          // Store the raw stdout for Podman telemetry parsing
          this._lastRunStdout = stdout;

          // Filter out telemetry output when running with Podman
          // Podman seems to output telemetry to stdout even when writing to file
          let result = stdout;
          if (env['GEMINI_SANDBOX'] === 'podman') {
            // Remove telemetry JSON objects from output
            // They are multi-line JSON objects that start with { and contain telemetry fields
            const lines = result.split(os.EOL);
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

            result = filteredLines.join('\n');
          }

          // Check if this is a JSON output test - if so, don't include stderr
          // as it would corrupt the JSON
          const isJsonOutput =
            commandArgs.includes('--output-format') &&
            commandArgs.includes('json');

          // If we have stderr output and it's not a JSON test, include that also
          if (stderr && !isJsonOutput) {
            result += `\n\nStdErr:\n${stderr}`;
          }

          resolve(result);
        } else {
          reject(new Error(`Process exited with code ${code}:\n${stderr}`));
        }
      });
    });

    return promise;
  }

  runCommand(
    args: string[],
    options: { stdin?: string } = {},
  ): Promise<string> {
    const { command, initialArgs } = this._getCommandAndArgs();
    const commandArgs = [...initialArgs, ...args];

    const child = spawn(command, commandArgs, {
      cwd: this.testDir!,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    if (options.stdin) {
      child.stdin!.write(options.stdin);
      child.stdin!.end();
    }

    child.stdout!.on('data', (data: Buffer) => {
      stdout += data;
      if (env['KEEP_OUTPUT'] === 'true' || env['VERBOSE'] === 'true') {
        process.stdout.write(data);
      }
    });

    child.stderr!.on('data', (data: Buffer) => {
      stderr += data;
      if (env['KEEP_OUTPUT'] === 'true' || env['VERBOSE'] === 'true') {
        process.stderr.write(data);
      }
    });

    const promise = new Promise<string>((resolve, reject) => {
      child.on('close', (code: number) => {
        if (code === 0) {
          this._lastRunStdout = stdout;
          let result = stdout;
          if (stderr) {
            result += `\n\nStdErr:\n${stderr}`;
          }
          resolve(result);
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
    // Clean up test directory
    if (this.testDir && !env['KEEP_OUTPUT']) {
      try {
        fs.rmSync(this.testDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
        if (env['VERBOSE'] === 'true') {
          console.warn('Cleanup warning:', (error as Error).message);
        }
      }
    }
  }

  async waitForTelemetryReady() {
    // Telemetry is always written to the test directory
    const logFilePath = join(this.testDir!, 'telemetry.log');

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
    // Use environment-specific timeout
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
    const logFilePath = join(this.testDir!, 'telemetry.log');

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
      const logFilePath = join(this.testDir!, 'telemetry.log');

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
          },
        });
      }
    }

    return logs;
  }

  readLastApiRequest(): ParsedLog | null {
    const logs = this._readAndParseTelemetryLog();
    const apiRequests = logs.filter(
      (logData) =>
        logData.attributes &&
        logData.attributes['event.name'] === 'gemini_cli.api_request',
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

  async runInteractive(...args: string[]): Promise<InteractiveRun> {
    const { command, initialArgs } = this._getCommandAndArgs(['--yolo']);
    const commandArgs = [...initialArgs, ...args];

    const options: pty.IPtyForkOptions = {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: this.testDir!,
      env: Object.fromEntries(
        Object.entries(env).filter(([, v]) => v !== undefined),
      ) as { [key: string]: string },
    };

    const executable = command === 'node' ? process.execPath : command;
    const ptyProcess = pty.spawn(executable, commandArgs, options);

    const run = new InteractiveRun(ptyProcess);
    // Wait for the app to be ready
    await run.expectText('Type your message', 30000);
    return run;
  }
}
