/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WorkerProvider interface defines the contract for different remote
 * execution environments (GCE, Workstations, etc.).
 */
export interface WorkerProvider {
  /**
   * Provisions the underlying infrastructure.
   */
  provision(): Promise<number>;

  /**
   * Ensures the worker is running and accessible.
   */
  ensureReady(): Promise<number>;

  /**
   * Performs the initial setup of the worker (SSH, scripts, auth).
   */
  setup(options: SetupOptions): Promise<number>;

  /**
   * Executes a command on the worker.
   */
  exec(command: string, options?: ExecOptions): Promise<number>;

  /**
   * Executes a command on the worker and returns the output.
   */
  getExecOutput(command: string, options?: ExecOptions): Promise<{ status: number; stdout: string; stderr: string }>;

  /**
   * Synchronizes local files to the worker.
   */
  sync(localPath: string, remotePath: string, options?: SyncOptions): Promise<number>;

  /**
   * Returns the status of the worker.
   */
  getStatus(): Promise<WorkerStatus>;

  /**
   * Stops the worker to save costs.
   */
  stop(): Promise<number>;
}

export interface SetupOptions {
  projectId: string;
  zone: string;
  dnsSuffix?: string;
  syncAuth?: boolean;
}

export interface ExecOptions {
  interactive?: boolean;
  cwd?: string;
  wrapContainer?: string;
}

export interface SyncOptions {
  delete?: boolean;
  exclude?: string[];
}

export interface WorkerStatus {
  name: string;
  status: string;
  internalIp?: string;
  externalIp?: string;
}
