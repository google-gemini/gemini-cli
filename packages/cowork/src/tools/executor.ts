/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Safe tool executor for Gemini Cowork.
 *
 * Responsibilities:
 *  - Read / write files with proper error handling.
 *  - Run shell commands ONLY after explicit human confirmation (human-in-the-loop).
 *  - Capture stdout + stderr and surface them as structured ToolResult objects.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname } from 'node:path';
import chalk from 'chalk';
import type { ReadFileInput, ShellRunInput, WriteFileInput } from './definitions.js';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface ToolResult {
  /** Primary output returned to the agent (stdout for shell, content for files). */
  output: string;
  /** Non-empty when the tool encountered an error or the command had stderr. */
  error?: string;
}

// ---------------------------------------------------------------------------
// read_file
// ---------------------------------------------------------------------------

/**
 * Read a file from disk and return its contents as a string.
 * Throws if the path does not exist or is not readable.
 */
export async function executeReadFile(
  input: ReadFileInput,
): Promise<ToolResult> {
  const content = await readFile(input.path, 'utf-8');
  return { output: content };
}

// ---------------------------------------------------------------------------
// write_file
// ---------------------------------------------------------------------------

/**
 * Write content to a file, creating intermediate directories as needed.
 */
export async function executeWriteFile(
  input: WriteFileInput,
): Promise<ToolResult> {
  await mkdir(dirname(input.path), { recursive: true });
  await writeFile(input.path, input.content, 'utf-8');
  return {
    output: `Wrote ${input.content.length} bytes to ${input.path}`,
  };
}

// ---------------------------------------------------------------------------
// shell_run — human-in-the-loop gate
// ---------------------------------------------------------------------------

/**
 * Prompt the user to confirm execution of a shell command.
 *
 * Returns `true` if the user types "y" or "Y", `false` for anything else
 * (including an empty Enter press, which defaults to "No").
 */
export async function promptShellConfirmation(
  command: string,
): Promise<boolean> {
  // Guard: in non-interactive environments skip the readline dance.
  if (!process.stdin.isTTY) {
    process.stderr.write(
      chalk.red(
        `[shell_run] Non-interactive terminal — rejecting command: ${command}\n`,
      ),
    );
    return false;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    const prompt =
      chalk.yellow('\n┌─ Human-in-the-loop confirmation required ─────────\n') +
      chalk.yellow('│  Command: ') +
      chalk.bold.white(command) +
      chalk.yellow('\n└────────────────────────────────────────────────────\n') +
      chalk.yellow('  Run this command? ') +
      chalk.dim('[y/N] ');

    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/**
 * Execute a shell command after obtaining explicit user approval.
 *
 * - Uses `spawn` with `shell: true` so pipes and shell built-ins work.
 * - Streams stdout/stderr into memory and resolves once the process exits.
 * - If the user rejects the command the result carries an error message and
 *   an empty output — the agent can observe this and adjust its plan.
 */
export async function executeShellRun(
  input: ShellRunInput,
): Promise<ToolResult> {
  const confirmed = await promptShellConfirmation(input.command);

  if (!confirmed) {
    return {
      output: '',
      error: 'Command execution was rejected by the user.',
    };
  }

  return new Promise<ToolResult>((resolve) => {
    const child = spawn(input.command, {
      cwd: input.cwd ?? process.cwd(),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      const exitError =
        code !== 0 ? `Process exited with code ${String(code)}.` : undefined;

      resolve({
        output: stdout,
        error: stderr || exitError,
      });
    });

    child.on('error', (err) => {
      resolve({
        output: stdout,
        error: `Failed to start process: ${err.message}`,
      });
    });
  });
}
