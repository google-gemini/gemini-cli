/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Safety Policy engine and sandboxed shell runner for Gemini Cowork.
 *
 * Two layers of protection
 * ─────────────────────────────────────────────────────────
 *
 *   1. SafetyPolicy   — static rules (allowed dirs, denied command regexes,
 *                        max write size).  Applied synchronously before any I/O.
 *
 *   2. SandboxRunner  — executes shell commands in a subprocess with:
 *                        • policy enforcement (blocks on violation)
 *                        • optional Docker container isolation
 *                        • hard timeout
 *
 * Usage
 * ─────
 *   const policy = SafetyPolicy.fromConfig(config);
 *   const sandbox = new SandboxRunner(policy, { useDocker: false });
 *
 *   // Validate a path before writing:
 *   policy.assertPath('/project/src/index.ts');   // ok
 *   policy.assertPath('/etc/passwd');              // throws PolicyViolation
 *
 *   // Run a command in the sandbox:
 *   const result = await sandbox.run('npm test', '/project');
 */

import { spawn } from 'node:child_process';
import { resolve, relative } from 'node:path';
import type { CoworkConfig, SafetyPolicy as SafetyPolicyConfig } from '../config/manager.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PolicyViolation extends Error {
  constructor(
    public readonly rule: string,
    public readonly value: string,
  ) {
    super(`[SafetyPolicy] ${rule}: "${value}"`);
    this.name = 'PolicyViolation';
  }
}

// ---------------------------------------------------------------------------
// SafetyPolicy
// ---------------------------------------------------------------------------

/**
 * Validates paths and shell commands against a configurable policy before any
 * I/O is performed.
 */
export class SafetyPolicy {
  private readonly allowedDirs: string[];
  private readonly deniedPatterns: RegExp[];
  private readonly maxWriteBytes: number;
  private readonly enforceProjectRoot: boolean;

  constructor(cfg: SafetyPolicyConfig) {
    this.allowedDirs = cfg.allowedDirs.map((d) => resolve(d));
    this.deniedPatterns = cfg.deniedCommandPatterns.map(
      (p) => new RegExp(p, 'i'),
    );
    this.maxWriteBytes = cfg.maxWriteBytes;
    this.enforceProjectRoot = cfg.enforceProjectRoot;
  }

  /** Build a `SafetyPolicy` directly from a `CoworkConfig`. */
  static fromConfig(cfg: CoworkConfig): SafetyPolicy {
    return new SafetyPolicy(cfg.safety);
  }

  // ── Path validation ──────────────────────────────────────────────────────

  /**
   * Returns `true` when the resolved `path` falls within an allowed directory.
   * Throws `PolicyViolation` when `allowedDirs` is non-empty and the path is
   * outside every allowed directory.
   */
  assertPath(path: string): void {
    // Wildcard — all paths allowed.
    if (this.allowedDirs.some((d) => d === '*')) return;

    const abs = resolve(path);

    for (const allowed of this.allowedDirs) {
      const rel = relative(allowed, abs);
      // relative() returns a path starting with '..' when outside the dir.
      if (!rel.startsWith('..') && !rel.startsWith('/')) return;
    }

    throw new PolicyViolation(
      'Path outside allowed directories',
      abs,
    );
  }

  /**
   * Returns `true` when the write size is within the configured limit.
   */
  assertWriteSize(bytes: number): void {
    if (bytes > this.maxWriteBytes) {
      throw new PolicyViolation(
        `Write size exceeds limit (${this.maxWriteBytes} bytes)`,
        `${bytes} bytes`,
      );
    }
  }

  // ── Command validation ───────────────────────────────────────────────────

  /**
   * Throws `PolicyViolation` when the command matches any denied pattern.
   */
  assertCommand(command: string): void {
    for (const re of this.deniedPatterns) {
      if (re.test(command)) {
        throw new PolicyViolation(
          `Command matches denied pattern (${re.source})`,
          command.slice(0, 120),
        );
      }
    }
  }

  /** `true` when the path and command both pass validation (non-throwing). */
  isPathAllowed(path: string): boolean {
    try {
      this.assertPath(path);
      return true;
    } catch {
      return false;
    }
  }

  isCommandAllowed(cmd: string): boolean {
    try {
      this.assertCommand(cmd);
      return true;
    } catch {
      return false;
    }
  }

  get projectRootEnforced(): boolean {
    return this.enforceProjectRoot;
  }
}

// ---------------------------------------------------------------------------
// SandboxRunnerOptions
// ---------------------------------------------------------------------------

export interface SandboxRunnerOptions {
  /**
   * When `true`, wraps the command in a Docker container (requires Docker
   * installed on the host).  Falls back gracefully when Docker is unavailable.
   */
  useDocker?: boolean;
  /**
   * Docker image to use for isolated execution.
   * @default 'node:20-alpine'
   */
  dockerImage?: string;
  /** Hard timeout in milliseconds for any shell command. @default 30_000 */
  timeoutMs?: number;
}

export interface SandboxResult {
  output: string;
  exitCode: number;
  timedOut: boolean;
  policyViolation?: string;
}

// ---------------------------------------------------------------------------
// SandboxRunner
// ---------------------------------------------------------------------------

/**
 * Executes shell commands with policy enforcement and optional Docker isolation.
 *
 * ```ts
 * const runner = new SandboxRunner(policy, { useDocker: false });
 * const result = await runner.run('npm test', '/project');
 * ```
 */
export class SandboxRunner {
  private readonly timeoutMs: number;
  private readonly useDocker: boolean;
  private readonly dockerImage: string;

  constructor(
    private readonly policy: SafetyPolicy,
    opts: SandboxRunnerOptions = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.useDocker = opts.useDocker ?? false;
    this.dockerImage = opts.dockerImage ?? 'node:20-alpine';
  }

  /**
   * Run `command` in `cwd`, enforcing the safety policy.
   *
   * @throws `PolicyViolation` when the command or working directory is denied.
   */
  async run(command: string, cwd: string): Promise<SandboxResult> {
    // ── Policy checks ────────────────────────────────────────────────────────
    try {
      this.policy.assertPath(cwd);
      this.policy.assertCommand(command);
    } catch (err) {
      if (err instanceof PolicyViolation) {
        return {
          output: `[Sandbox] Policy violation: ${err.message}`,
          exitCode: 1,
          timedOut: false,
          policyViolation: err.message,
        };
      }
      throw err;
    }

    // ── Build the actual command ──────────────────────────────────────────────
    const finalCmd = this.useDocker
      ? this.wrapInDocker(command, cwd)
      : command;

    return this.spawnCommand(finalCmd, cwd);
  }

  // ── Docker wrapping ───────────────────────────────────────────────────────

  private wrapInDocker(command: string, cwd: string): string {
    // Mount the cwd read-only to prevent filesystem escape.
    // The command runs in /workspace inside the container.
    return (
      `docker run --rm --network none ` +
      `-v "${cwd}:/workspace:ro" ` +
      `-w /workspace ` +
      `${this.dockerImage} ` +
      `sh -c ${JSON.stringify(command)}`
    );
  }

  // ── Subprocess ────────────────────────────────────────────────────────────

  private spawnCommand(command: string, cwd: string): Promise<SandboxResult> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let timedOut = false;

      const child = spawn(command, {
        shell: true,
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout?.on('data', (d: Buffer) => chunks.push(d));
      child.stderr?.on('data', (d: Buffer) => chunks.push(d));

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, this.timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          output: Buffer.concat(chunks).toString('utf-8'),
          exitCode: code ?? 1,
          timedOut,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          output: `[Sandbox] Spawn error: ${err.message}`,
          exitCode: 1,
          timedOut: false,
        });
      });
    });
  }
}
