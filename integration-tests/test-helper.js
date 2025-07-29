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

export class TestRig {
  constructor() {
    this.bundlePath = join(__dirname, '..', 'bundle/gemini.js');
    this.testDir = null;
  }

  setup(testName, options = {}) {
    this.testName = testName;
    const sanitizedName = sanitizeTestName(testName);
    this.testDir = join(env.INTEGRATION_TEST_FILE_DIR, sanitizedName);
    mkdirSync(this.testDir, { recursive: true });

    // Create a settings file to point the CLI to the local collector
    const geminiDir = join(this.testDir, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    // In sandbox mode, use a relative path for telemetry that works inside the container
    const telemetryPath =
      env.GEMINI_SANDBOX && env.GEMINI_SANDBOX !== 'false'
        ? 'telemetry.log' // Relative path in current directory
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
          resolve(stdout);
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

  async waitForToolCall(toolName, timeout = 5000) {
    // Since we now wait for CLI to complete first, we don't need the initial wait
    return this.poll(
      () => {
        const toolLogs = this.readToolLogs();
        return toolLogs.some((log) => log.toolRequest.name === toolName);
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

  readToolLogs() {
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
