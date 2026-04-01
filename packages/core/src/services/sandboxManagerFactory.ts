/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import {
  type SandboxManager,
  NoopSandboxManager,
  LocalSandboxManager,
  type GlobalSandboxOptions,
} from './sandboxManager.js';
import { LinuxSandboxManager } from '../sandbox/linux/LinuxSandboxManager.js';
import { MacOsSandboxManager } from '../sandbox/macos/MacOsSandboxManager.js';
import { WindowsSandboxManager } from '../sandbox/windows/WindowsSandboxManager.js';
import type { SandboxConfig } from '../config/config.js';

/**
 * Creates a sandbox manager based on the provided settings.
 */
export function createSandboxManager(
  sandbox: SandboxConfig | undefined,
  options: GlobalSandboxOptions,
  approvalMode?: string,
): SandboxManager {
  if (approvalMode === 'yolo') {
    return new NoopSandboxManager();
  }

  if (!options.modeConfig && options.policyManager && approvalMode) {
    options.modeConfig = options.policyManager.getModeConfig(approvalMode);
  }

  if (sandbox?.enabled) {
    if (os.platform() === 'win32') {
      return new WindowsSandboxManager(options);
    } else if (os.platform() === 'linux') {
      return new LinuxSandboxManager(options);
    } else if (os.platform() === 'darwin') {
      return new MacOsSandboxManager(options);
    }
    return new LocalSandboxManager();
  }

  return new NoopSandboxManager();
}
