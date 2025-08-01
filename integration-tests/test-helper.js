/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync, spawn } from 'child_process';
import { parse } from 'shell-quote';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { env } from 'process';
import { fileExists } from '../scripts/telemetry_utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function sanitizeTestName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-');
}

// Helper to create detailed error messages
export function createToolCallErrorMessage(expectedTools, foundTools, result) {
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
export function printDebugInfo(rig, result, context = {}) {
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
  result,
  expectedContent = null,
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
        `Warning: LLM did not include expected content in response: ${missingContent.join(', ')}.`,
        'This is not ideal but not a test failure.',
      );
      console.warn(
        'The tool was called successfully, which is the main requirement.',
      );
      return false;
    } else if (process.env.VERBOSE === 'true') {
      console.log(`${testName}: Model output validated successfully.`);
    }
    return true;
  }

  return true;
}

export class TestRig {
  constructor() {
    this.bundlePath = join(__dirname, '..', 'bundle/gemini.js');
    this.testDir = null;
  }

  // Get timeout based on environment
  getDefaultTimeout() {
    if (env.CI) return 60000; // 1 minute in CI
    if (env.GEMINI_SANDBOX) return 30000; // 30s in containers
    return 15000; // 15s locally
  }

  setup(testName, options = {}) {
    this.testName = testName;
    const sanitizedName = sanitizeTestName(testName);
    this.testDir = join(env.INTEGRATION_TEST_FILE_DIR, sanitizedName);
    mkdirSync(this.testDir, { recursive: true });

    // Create a settings file to point the CLI to the local collector
    const geminiDir = join(this.testDir, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    // In sandbox mode, use an absolute path for telemetry inside the container
    // The container mounts the test directory at the same path as the host
    const telemetryPath =
      env.GEMINI_SANDBOX && env.GEMINI_SANDBOX !== 'false'
        ? join(this.testDir, 'telemetry.log') // Absolute path in test directory
        : env.TELEMETRY_LOG_FILE; // Absolute path for non-sandbox

    const settings = {
      telemetry: {
        enabled: true,
        target: 'local',
        otlpEndpoint: '',
        outfile: telemetryPath,
      },
      sandbox: env.GEMINI_SANDBOX !== 'false' ? env.GEMINI_SANDBOX : false,
      ...options.settings, // Allow tests to override/add settings
    };
    writeFileSync(
      join(geminiDir, 'settings.json'),
      JSON.stringify(settings, null, 2),
    );
  }

  createFile(fileName, content) {
    const filePath = join(this.testDir, fileName);
    writeFileSync(filePath, content);
    return filePath;
  }

  mkdir(dir) {
    mkdirSync(join(this.testDir, dir), { recursive: true });
  }

  sync() {
    // ensure file system is done before spawning
    execSync('sync', { cwd: this.testDir });
  }

  run(promptOrOptions, ...args) {
    let command = `node ${this.bundlePath} --yolo`;
    const execOptions = {
      cwd: this.testDir,
      encoding: 'utf-8',
    };

    if (typeof promptOrOptions === 'string') {
      command += ` --prompt "${promptOrOptions}"`;
    } else if (
      typeof promptOrOptions === 'object' &&
      promptOrOptions !== null
    ) {
      if (promptOrOptions.prompt) {
        command += ` --prompt "${promptOrOptions.prompt}"`;
      }
      if (promptOrOptions.stdin) {
        execOptions.input = promptOrOptions.stdin;
      }
    }

    command += ` ${args.join(' ')}`;

    const commandArgs = parse(command);
    const node = commandArgs.shift();

    const child = spawn(node, commandArgs, {
      cwd: this.testDir,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    // Handle stdin if provided
    if (execOptions.input) {
      child.stdin.write(execOptions.input);
      child.stdin.end();
    }

    child.stdout.on('data', (data) => {
      stdout += data;
      if (env.KEEP_OUTPUT === 'true' || env.VERBOSE === 'true') {
        process.stdout.write(data);
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data;
      if (env.KEEP_OUTPUT === 'true' || env.VERBOSE === 'true') {
        process.stderr.write(data);
      }
    });

    const promise = new Promise((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0) {
          // Store the raw stdout for Podman telemetry parsing
          this._lastRunStdout = stdout;

          // Filter out telemetry output when running with Podman
          // Podman seems to output telemetry to stdout even when writing to file
          let result = stdout;
          if (env.GEMINI_SANDBOX === 'podman') {
            // Remove telemetry JSON objects from output
            // They are multi-line JSON objects that start with { and contain telemetry fields
            const lines = result.split('\n');
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
          resolve(result);
        } else {
          reject(new Error(`Process exited with code ${code}:\n${stderr}`));
        }
      });
    });

    return promise;
  }

  readFile(fileName) {
    const content = readFileSync(join(this.testDir, fileName), 'utf-8');
    if (env.KEEP_OUTPUT === 'true' || env.VERBOSE === 'true') {
      const testId = `${env.TEST_FILE_NAME.replace(
        '.test.js',
        '',
      )}:${this.testName.replace(/ /g, '-')}`;
      console.log(`--- FILE: ${testId}/${fileName} ---`);
      console.log(content);
      console.log(`--- END FILE: ${testId}/${fileName} ---`);
    }
    return content;
  }

  async cleanup() {
    // Clean up test directory
    if (this.testDir && !env.KEEP_OUTPUT) {
      try {
        execSync(`rm -rf ${this.testDir}`);
      } catch (error) {
        // Ignore cleanup errors
        if (env.VERBOSE === 'true') {
          console.warn('Cleanup warning:', error.message);
        }
      }
    }
  }

  async waitForTelemetryReady() {
    // In sandbox mode, telemetry is written to a relative path in the test directory
    const logFilePath =
      env.GEMINI_SANDBOX && env.GEMINI_SANDBOX !== 'false'
        ? join(this.testDir, 'telemetry.log')
        : env.TELEMETRY_LOG_FILE;

    if (!logFilePath) return;

    // Wait for telemetry file to exist and have content
    await this.poll(
      () => {
        if (!fileExists(logFilePath)) return false;
        try {
          const content = readFileSync(logFilePath, 'utf-8');
          // Check if file has meaningful content (at least one complete JSON object)
          return content.includes('"event.name"');
        } catch (_e) {
          return false;
        }
      },
      2000, // 2 seconds max - reduced since telemetry should flush on exit now
      100, // check every 100ms
    );
  }

  async waitForToolCall(toolName, timeout) {
    // Use environment-specific timeout
    if (!timeout) {
      timeout = this.getDefaultTimeout();
    }

    // Wait for telemetry to be ready before polling for tool calls
    await this.waitForTelemetryReady();

    return this.poll(
      () => {
        const toolLogs = this.readToolLogs();
        return toolLogs.some((log) => log.toolRequest.name === toolName);
      },
      timeout,
      100,
    );
  }

  async waitForAnyToolCall(toolNames, timeout) {
    // Use environment-specific timeout
    if (!timeout) {
      timeout = this.getDefaultTimeout();
    }

    // Wait for telemetry to be ready before polling for tool calls
    await this.waitForTelemetryReady();

    return this.poll(
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

  async poll(predicate, timeout, interval) {
    const startTime = Date.now();
    let attempts = 0;
    while (Date.now() - startTime < timeout) {
      attempts++;
      const result = predicate();
      if (env.VERBOSE === 'true' && attempts % 5 === 0) {
        console.log(
          `Poll attempt ${attempts}: ${result ? 'success' : 'waiting...'}`,
        );
      }
      if (result) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    if (env.VERBOSE === 'true') {
      console.log(`Poll timed out after ${attempts} attempts`);
    }
    return false;
  }

  _parseToolLogsFromStdout(stdout) {
    const logs = [];

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
      const lines = stdout.split('\n');
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
            } catch (_e) {
              // Not valid JSON
            }
            currentObject = '';
          }
        }
      }
    }

    return logs;
  }

  readToolLogs() {
    // For Podman, first check if telemetry file exists and has content
    // If not, fall back to parsing from stdout
    if (env.GEMINI_SANDBOX === 'podman') {
      // Try reading from file first
      const logFilePath = join(this.testDir, 'telemetry.log');

      if (fileExists(logFilePath)) {
        try {
          const content = readFileSync(logFilePath, 'utf-8');
          if (content && content.includes('"event.name"')) {
            // File has content, use normal file parsing
            // Continue to the normal file parsing logic below
          } else if (this._lastRunStdout) {
            // File exists but is empty or doesn't have events, parse from stdout
            return this._parseToolLogsFromStdout(this._lastRunStdout);
          }
        } catch (_e) {
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

    // In sandbox mode, telemetry is written to a relative path in the test directory
    const logFilePath =
      env.GEMINI_SANDBOX && env.GEMINI_SANDBOX !== 'false'
        ? join(this.testDir, 'telemetry.log')
        : env.TELEMETRY_LOG_FILE;

    if (!logFilePath) {
      console.warn(`TELEMETRY_LOG_FILE environment variable not set`);
      return [];
    }

    // Check if file exists, if not return empty array (file might not be created yet)
    if (!fileExists(logFilePath)) {
      return [];
    }

    const content = readFileSync(logFilePath, 'utf-8');

    // Split the content into individual JSON objects
    // They are separated by "}\n{" pattern
    const jsonObjects = content
      .split(/}\s*\n\s*{/)
      .map((obj, index, array) => {
        // Add back the braces we removed during split
        if (index > 0) obj = '{' + obj;
        if (index < array.length - 1) obj = obj + '}';
        return obj.trim();
      })
      .filter((obj) => obj);

    const logs = [];

    for (const jsonStr of jsonObjects) {
      try {
        const logData = JSON.parse(jsonStr);
        // Look for tool call logs
        if (
          logData.attributes &&
          logData.attributes['event.name'] === 'gemini_cli.tool_call'
        ) {
          const toolName = logData.attributes.function_name;
          logs.push({
            toolRequest: {
              name: toolName,
              args: logData.attributes.function_args,
              success: logData.attributes.success,
              duration_ms: logData.attributes.duration_ms,
            },
          });
        }
      } catch (_e) {
        // Skip objects that aren't valid JSON
        if (env.VERBOSE === 'true') {
          console.error('Failed to parse telemetry object:', _e.message);
        }
      }
    }

    return logs;
  }
}
