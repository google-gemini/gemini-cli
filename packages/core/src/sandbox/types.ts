/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unified Sandbox Driver Architecture types.
 * GSoC 2026 Idea #10
 */

export enum SandboxStatus {
  Uninitialized = 'uninitialized',
  Initializing = 'initializing',
  Ready = 'ready',
  Running = 'running',
  Stopped = 'stopped',
  Failed = 'failed',
}

export enum SandboxDriverType {
  NoOp = 'noop',
  Seatbelt = 'seatbelt',
  Docker = 'docker',
  Podman = 'podman',
  Bubblewrap = 'bubblewrap',
  AppContainer = 'appcontainer',
}

export enum IsolationLevel {
  None = 'none',
  FileSystem = 'filesystem',
  Network = 'network',
  Full = 'full',
}

export interface SandboxCapabilities {
  isolationLevels: IsolationLevel[];
  fileSystemIsolation: boolean;
  networkIsolation: boolean;
  processIsolation: boolean;
  mountSupport: boolean;
  envForwarding: boolean;
  portForwarding: boolean;
  platforms: NodeJS.Platform[];
}

export interface MountConfig {
  source: string;
  target: string;
  readonly: boolean;
}

export interface SandboxConfig {
  workDir: string;
  mounts: MountConfig[];
  env: Record<string, string>;
  ports: number[];
  isolationLevel: IsolationLevel;
  profile?: string;
  proxyCommand?: string;
}

export interface ExecOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface SandboxDiagnostic {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  suggestion?: string;
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  workDir: process.cwd(),
  mounts: [],
  env: {},
  ports: [],
  isolationLevel: IsolationLevel.FileSystem,
};
