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
   * Ensures the workspace is running and accessible.
   */
  ensureReady(): Promise<number>;

  /**
   * Performs the initial setup of the workspace (SSH, scripts, auth).
   */
  setup(options: SetupOptions): Promise<number>;

  /**
   * Returns the raw command string that would be used to execute a command.
   */
  getRunCommand(command: string, options?: ExecOptions): string;

  /**
   * Executes a command on the workspace.
   */
  exec(command: string, options?: ExecOptions): Promise<number>;

  /**
   * Executes a command on the workspace and returns the output.
   */
  getExecOutput(
    command: string,
    options?: ExecOptions,
  ): Promise<{ status: number; stdout: string; stderr: string }>;

  /**
   * Synchronizes local files to the workspace.
   */
  sync(
    localPath: string,
    remotePath: string,
    options?: SyncOptions,
  ): Promise<number>;

  /**
   * Returns the status of the workspace.
   */
  getStatus(): Promise<WorkspaceStatus>;

  /**
   * Stops the workspace to save costs.
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
  sudo?: boolean;
}

export interface WorkspaceStatus {
  name: string;
  status: string;
  internalIp?: string;
  externalIp?: string;
}
