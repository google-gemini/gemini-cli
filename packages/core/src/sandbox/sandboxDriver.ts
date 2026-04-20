/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SandboxCapabilities,
  SandboxConfig,
  SandboxDiagnostic,
  SandboxDriverType,
  SandboxStatus,
  ExecOptions,
  ExecResult,
} from './types.js';

export interface SandboxDriver {
  readonly type: SandboxDriverType;
  readonly name: string;
  readonly status: SandboxStatus;
  isAvailable(): Promise<boolean>;
  getCapabilities(): SandboxCapabilities;
  initialize(config: SandboxConfig): Promise<SandboxDiagnostic[]>;
  start(): Promise<void>;
  execute(command: string, options?: ExecOptions): Promise<ExecResult>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
  diagnose(): Promise<SandboxDiagnostic[]>;
}
