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

export class PodmanDriver implements SandboxDriver {
  readonly type = SandboxDriverType.Podman;
  readonly name = 'Podman';
  private _status: SandboxStatus = SandboxStatus.Uninitialized;
  private config: SandboxConfig | null = null;
  private containerId: string | null = null;

  get status(): SandboxStatus {
    return this._status;
  }

  async isAvailable(): Promise<boolean> {
    try {
      execSync('podman info', { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  getCapabilities(): SandboxCapabilities {
    return {
      isolationLevels: [
        IsolationLevel.FileSystem,
        IsolationLevel.Network,
        IsolationLevel.Full,
      ],
      fileSystemIsolation: true,
      networkIsolation: true,
      processIsolation: true,
      mountSupport: true,
      envForwarding: true,
      portForwarding: true,
      platforms: ['linux', 'darwin'],
    };
  }

  async initialize(config: SandboxConfig): Promise<SandboxDiagnostic[]> {
    this._status = SandboxStatus.Initializing;
    this.config = config;
    const diagnostics: SandboxDiagnostic[] = [];

    const available = await this.isAvailable();
    if (!available) {
      this._status = SandboxStatus.Failed;
      diagnostics.push({
        level: 'error',
        code: 'PODMAN_NOT_AVAILABLE',
        message: 'Podman is not installed or not running.',
        suggestion:
          'Install Podman: https://podman.io/getting-started/installation',
      });
      return diagnostics;
    }

    this._status = SandboxStatus.Ready;
    diagnostics.push({
      level: 'info',
      code: 'PODMAN_READY',
      message: 'Podman is available.',
    });
    return diagnostics;
  }

  async start(): Promise<void> {
    if (this._status !== SandboxStatus.Ready || !this.config) {
      throw new Error('Cannot start: driver is ' + this._status);
    }

    const args = ['podman', 'run', '-d', '--rm'];

    for (const mount of this.config.mounts) {
      const flag = mount.readonly ? 'ro' : 'rw';
      args.push('-v', `${mount.source}:${mount.target}:${flag}`);
    }

    args.push('-v', `${this.config.workDir}:/workspace:rw`, '-w', '/workspace');

    for (const [key, value] of Object.entries(this.config.env)) {
      args.push('-e', `${key}=${value}`);
    }

    for (const port of this.config.ports) {
      args.push('-p', `${port}:${port}`);
    }

    if (
      this.config.isolationLevel === IsolationLevel.Network ||
      this.config.isolationLevel === IsolationLevel.Full
    ) {
      args.push('--network', 'none');
    }

    args.push('node:20-slim', 'sleep', 'infinity');

    return new Promise<void>((resolve, reject) => {
      exec(args.join(' '), { timeout: 30000 }, (err, stdout) => {
        if (err) {
          this._status = SandboxStatus.Failed;
          reject(new Error('Failed to start Podman container: ' + err.message));
          return;
        }
        this.containerId = stdout.trim().slice(0, 12);
        this._status = SandboxStatus.Ready;
        resolve();
      });
    });
  }

  async execute(command: string, options?: ExecOptions): Promise<ExecResult> {
    if (!this.containerId) throw new Error('Container not started');
    const startTime = Date.now();
    this._status = SandboxStatus.Running;

    const args = ['podman', 'exec'];
    if (options?.cwd) args.push('-w', options.cwd);
    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }
    args.push(this.containerId, 'sh', '-c', command);

    return new Promise<ExecResult>((resolve) => {
      const child = exec(args.join(' '), {
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
    if (this.containerId) {
      try {
        execSync(`podman stop ${this.containerId}`, {
          stdio: 'ignore',
          timeout: 10000,
        });
      } catch {
        /* ok */
      }
    }
    this._status = SandboxStatus.Stopped;
  }

  async cleanup(): Promise<void> {
    if (this.containerId) {
      try {
        execSync(`podman rm -f ${this.containerId}`, {
          stdio: 'ignore',
          timeout: 10000,
        });
      } catch {
        /* ok */
      }
      this.containerId = null;
    }
    this._status = SandboxStatus.Uninitialized;
    this.config = null;
  }

  async diagnose(): Promise<SandboxDiagnostic[]> {
    const available = await this.isAvailable();
    return [
      {
        level: available ? 'info' : 'error',
        code: available ? 'PODMAN_OK' : 'PODMAN_UNAVAILABLE',
        message: available ? 'Podman is running.' : 'Podman not available.',
        suggestion: available
          ? undefined
          : 'Install Podman: https://podman.io/getting-started/installation',
      },
    ];
  }
}
