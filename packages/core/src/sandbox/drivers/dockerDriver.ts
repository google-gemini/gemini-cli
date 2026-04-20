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

export class DockerDriver implements SandboxDriver {
  readonly type = SandboxDriverType.Docker;
  readonly name = 'Docker';
  private _status: SandboxStatus = SandboxStatus.Uninitialized;
  private config: SandboxConfig | null = null;
  private containerId: string | null = null;

  get status(): SandboxStatus {
    return this._status;
  }

  async isAvailable(): Promise<boolean> {
    try {
      execSync('docker info', { stdio: 'ignore', timeout: 5000 });
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
      platforms: ['win32', 'darwin', 'linux'],
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
        code: 'DOCKER_NOT_AVAILABLE',
        message: 'Docker is not installed or not running.',
        suggestion: 'Install Docker Desktop or start the Docker daemon.',
      });
      return diagnostics;
    }

    diagnostics.push({
      level: 'info',
      code: 'DOCKER_READY',
      message: 'Docker daemon is available and running.',
    });

    this._status = SandboxStatus.Ready;
    return diagnostics;
  }

  async start(): Promise<void> {
    if (this._status !== SandboxStatus.Ready || !this.config) {
      throw new Error('Cannot start: driver is ' + this._status);
    }

    const args = ['docker', 'run', '-d', '--rm'];

    // Add mounts
    for (const mount of this.config.mounts) {
      const flag = mount.readonly ? 'ro' : 'rw';
      args.push('-v', `${mount.source}:${mount.target}:${flag}`);
    }

    // Add work dir mount
    args.push('-v', `${this.config.workDir}:/workspace:rw`);
    args.push('-w', '/workspace');

    // Add environment variables
    for (const [key, value] of Object.entries(this.config.env)) {
      args.push('-e', `${key}=${value}`);
    }

    // Add port forwarding
    for (const port of this.config.ports) {
      args.push('-p', `${port}:${port}`);
    }

    // Network isolation
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
          reject(new Error('Failed to start Docker container: ' + err.message));
          return;
        }
        this.containerId = stdout.trim().slice(0, 12);
        this._status = SandboxStatus.Ready;
        resolve();
      });
    });
  }

  async execute(command: string, options?: ExecOptions): Promise<ExecResult> {
    if (!this.containerId) {
      throw new Error('Container not started');
    }

    const startTime = Date.now();
    this._status = SandboxStatus.Running;

    const args = ['docker', 'exec'];
    if (options?.cwd) {
      args.push('-w', options.cwd);
    }
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
    if (this.containerId) {
      try {
        execSync(`docker stop ${this.containerId}`, {
          stdio: 'ignore',
          timeout: 10000,
        });
      } catch {
        /* container may already be stopped */
      }
    }
    this._status = SandboxStatus.Stopped;
  }

  async cleanup(): Promise<void> {
    if (this.containerId) {
      try {
        execSync(`docker rm -f ${this.containerId}`, {
          stdio: 'ignore',
          timeout: 10000,
        });
      } catch {
        /* container may already be removed */
      }
      this.containerId = null;
    }
    this._status = SandboxStatus.Uninitialized;
    this.config = null;
  }

  async diagnose(): Promise<SandboxDiagnostic[]> {
    const diagnostics: SandboxDiagnostic[] = [];
    const available = await this.isAvailable();

    diagnostics.push({
      level: available ? 'info' : 'error',
      code: available ? 'DOCKER_OK' : 'DOCKER_UNAVAILABLE',
      message: available
        ? 'Docker daemon is running.'
        : 'Docker daemon is not reachable.',
      suggestion: available
        ? undefined
        : 'Start Docker Desktop or run: sudo systemctl start docker',
    });

    if (this.containerId) {
      diagnostics.push({
        level: 'info',
        code: 'DOCKER_CONTAINER',
        message: `Active container: ${this.containerId}`,
      });
    }

    return diagnostics;
  }
}
