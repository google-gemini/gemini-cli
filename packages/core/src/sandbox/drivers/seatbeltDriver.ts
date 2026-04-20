/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, execSync } from 'node:child_process';
import type { SandboxDriver } from '../sandboxDriver.js';
import { SandboxDriverType, SandboxStatus, IsolationLevel } from '../types.js';
import type {
  SandboxCapabilities,
  SandboxConfig,
  SandboxDiagnostic,
  ExecOptions,
  ExecResult,
} from '../types.js';

export class SeatbeltDriver implements SandboxDriver {
  readonly type = SandboxDriverType.Seatbelt;
  readonly name = 'macOS Seatbelt';
  private _status: SandboxStatus = SandboxStatus.Uninitialized;
  private config: SandboxConfig | null = null;

  get status(): SandboxStatus {
    return this._status;
  }

  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'darwin') return false;
    try {
      execSync('which sandbox-exec', { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  getCapabilities(): SandboxCapabilities {
    return {
      isolationLevels: [IsolationLevel.FileSystem, IsolationLevel.Network],
      fileSystemIsolation: true,
      networkIsolation: true,
      processIsolation: false,
      mountSupport: false,
      envForwarding: true,
      portForwarding: false,
      platforms: ['darwin'],
    };
  }

  async initialize(config: SandboxConfig): Promise<SandboxDiagnostic[]> {
    this._status = SandboxStatus.Initializing;
    this.config = config;
    const diagnostics: SandboxDiagnostic[] = [];

    if (process.platform !== 'darwin') {
      this._status = SandboxStatus.Failed;
      diagnostics.push({
        level: 'error',
        code: 'SEATBELT_WRONG_PLATFORM',
        message: 'Seatbelt is only available on macOS.',
      });
      return diagnostics;
    }

    const available = await this.isAvailable();
    if (!available) {
      this._status = SandboxStatus.Failed;
      diagnostics.push({
        level: 'error',
        code: 'SEATBELT_NOT_FOUND',
        message: 'sandbox-exec binary not found.',
        suggestion: 'Seatbelt should be available by default on macOS.',
      });
      return diagnostics;
    }

    diagnostics.push({
      level: 'info',
      code: 'SEATBELT_READY',
      message: `Seatbelt available. Profile: ${config.profile ?? 'permissive-open'}`,
    });

    this._status = SandboxStatus.Ready;
    return diagnostics;
  }

  async start(): Promise<void> {
    if (this._status !== SandboxStatus.Ready) {
      throw new Error('Cannot start: driver is ' + this._status);
    }
  }

  async execute(command: string, options?: ExecOptions): Promise<ExecResult> {
    const startTime = Date.now();
    this._status = SandboxStatus.Running;

    const profile = this.config?.profile ?? 'permissive-open';
    const sandboxCmd = `sandbox-exec -f /usr/share/sandbox/${profile}.sb ${command}`;

    const env = { ...process.env, ...this.config?.env, ...options?.env };

    return new Promise<ExecResult>((resolve) => {
      const child = exec(sandboxCmd, {
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
    const available = await this.isAvailable();
    return [
      {
        level: available ? 'info' : 'error',
        code: available ? 'SEATBELT_OK' : 'SEATBELT_UNAVAILABLE',
        message: available
          ? 'Seatbelt (sandbox-exec) is available.'
          : 'Seatbelt not available on this platform.',
      },
    ];
  }
}
