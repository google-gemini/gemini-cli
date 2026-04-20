/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'node:child_process';
import type { SandboxDriver } from '../sandboxDriver.js';
import { SandboxDriverType, SandboxStatus, IsolationLevel } from '../types.js';
import type {
  SandboxCapabilities,
  SandboxConfig,
  SandboxDiagnostic,
  ExecOptions,
  ExecResult,
} from '../types.js';

export class NoopDriver implements SandboxDriver {
  readonly type = SandboxDriverType.NoOp;
  readonly name = 'No-Op (Unsandboxed)';
  private _status: SandboxStatus = SandboxStatus.Uninitialized;
  private config: SandboxConfig | null = null;

  get status(): SandboxStatus {
    return this._status;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  getCapabilities(): SandboxCapabilities {
    return {
      isolationLevels: [IsolationLevel.None],
      fileSystemIsolation: false,
      networkIsolation: false,
      processIsolation: false,
      mountSupport: false,
      envForwarding: true,
      portForwarding: false,
      platforms: ['win32', 'darwin', 'linux'],
    };
  }

  async initialize(config: SandboxConfig): Promise<SandboxDiagnostic[]> {
    this._status = SandboxStatus.Initializing;
    this.config = config;
    this._status = SandboxStatus.Ready;
    return [
      {
        level: 'warning',
        code: 'NOOP_NO_ISOLATION',
        message:
          'Running without sandboxing. Commands execute directly on the host.',
        suggestion:
          'Consider enabling Docker or Seatbelt sandboxing for better security.',
      },
    ];
  }

  async start(): Promise<void> {
    if (this._status !== SandboxStatus.Ready) {
      throw new Error('Cannot start: driver is ' + this._status);
    }
  }

  async execute(command: string, options?: ExecOptions): Promise<ExecResult> {
    const startTime = Date.now();
    this._status = SandboxStatus.Running;
    const env = { ...process.env, ...this.config?.env, ...options?.env };

    return new Promise<ExecResult>((resolve) => {
      const child = exec(command, {
        cwd: options?.cwd ?? this.config?.workDir,
        env,
        timeout: options?.timeout ?? 30000,
        maxBuffer: 10 * 1024 * 1024,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      child.stdout?.on('data', (data: string) => {
        stdout += data;
      });
      child.stderr?.on('data', (data: string) => {
        stderr += data;
      });

      if (options?.stdin) {
        child.stdin?.write(options.stdin);
        child.stdin?.end();
      }

      child.on('close', (code, signal) => {
        this._status = SandboxStatus.Ready;
        if (signal === 'SIGTERM') timedOut = true;
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          durationMs: Date.now() - startTime,
          timedOut,
        });
      });

      child.on('error', () => {
        this._status = SandboxStatus.Ready;
        resolve({
          exitCode: 1,
          stdout,
          stderr,
          durationMs: Date.now() - startTime,
          timedOut: false,
        });
      });
    });
  }

  async stop(): Promise<void> {
    this._status = SandboxStatus.Stopped;
  }

  async cleanup(): Promise<void> {
    this._status = SandboxStatus.Uninitialized;
    this.config = null;
  }

  async diagnose(): Promise<SandboxDiagnostic[]> {
    return [
      {
        level: 'info',
        code: 'NOOP_STATUS',
        message: 'No-op driver: no isolation provided.',
      },
    ];
  }
}
