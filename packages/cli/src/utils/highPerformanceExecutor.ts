/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { optimizeInputPerformance } from './performanceOptimizer.js';
import { sanitizeSandboxEnvironment } from '../sandbox/security.js';

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  shell?: boolean;
  timeout?: number; // ms
  maxBuffer?: number; // bytes
  windowsHide?: boolean;
  input?: string; // optional stdin payload
  signal?: AbortSignal;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

/**
 * Executes commands with tight resource management and responsive defaults.
 */
export async function executeHighPerformanceCommand(
  command: string,
  args: readonly string[] = [],
  options: ExecOptions = {},
): Promise<ExecResult> {
  // Keep the execution path lean and predictable
  optimizeInputPerformance(command, 'command');
  const safeArgs = args.map((a) => optimizeInputPerformance(String(a), 'argument') ?? '').filter(Boolean);

  const maxBuffer = options.maxBuffer ?? 5 * 1024 * 1024; // 5MB
  const timeoutMs = options.timeout ?? 30_000; // 30s

  // Favor no shell for predictable parsing unless explicitly requested
  const shell = options.shell === true ? true : false;

  // Keep the child env compact for faster spawn and lower memory
  const baseEnv = options.env ? sanitizeSandboxEnvironment(options.env) : undefined;

  const child = spawn(command, safeArgs, {
    cwd: options.cwd,
    env: baseEnv as NodeJS.ProcessEnv | undefined,
    shell,
    windowsHide: options.windowsHide ?? true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Buffer management
  let stdout = '';
  let stderr = '';
  let stdoutTruncated = false;
  let stderrTruncated = false;

  const append = (buf: Buffer, target: 'out' | 'err') => {
    const s = buf.toString('utf8');
    if (target === 'out') {
      if (stdout.length < maxBuffer) stdout += s.slice(0, Math.max(0, maxBuffer - stdout.length));
      else stdoutTruncated = true;
    } else {
      if (stderr.length < maxBuffer) stderr += s.slice(0, Math.max(0, maxBuffer - stderr.length));
      else stderrTruncated = true;
    }
  };

  child.stdout?.on('data', (b: Buffer) => append(b, 'out'));
  child.stderr?.on('data', (b: Buffer) => append(b, 'err'));

  // Timeout + abort handling
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    // Try graceful first
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
    }, 5_000);
  }, timeoutMs);

  const abortHandler = () => {
    child.kill('SIGTERM');
  };
  options.signal?.addEventListener('abort', abortHandler, { once: true });

  // Optional stdin payload
  if (options.input) {
    child.stdin?.write(options.input);
    child.stdin?.end();
  } else {
    child.stdin?.end();
  }

  try {
    const [code] = (await once(child, 'close')) as [number];
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortHandler);

    if (stdoutTruncated) stdout += '\n[output truncated]\n';
    if (stderrTruncated) stderr += '\n[error output truncated]\n';

    return { stdout, stderr, exitCode: code ?? 0, timedOut };
  } catch (e) {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortHandler);
    const err = e as Error;
    stderr += `\n${err.message}`;
    return { stdout, stderr, exitCode: 1, timedOut };
  }
}

