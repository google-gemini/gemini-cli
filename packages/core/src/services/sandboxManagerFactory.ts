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
} from './sandboxManager.js';
import { LinuxSandboxManager } from '../sandbox/linux/LinuxSandboxManager.js';
import { MacOsSandboxManager } from '../sandbox/macos/MacOsSandboxManager.js';
import { WindowsSandboxManager } from './windowsSandboxManager.js';
import type { SandboxConfig } from '../config/config.js';
import { type SandboxPolicyManager } from '../policy/sandboxPolicyManager.js';

/**
 * Creates a sandbox manager based on the provided settings.
 */
export function createSandboxManager(
  sandbox: SandboxConfig | undefined,
  workspace: string,
  policyManager?: SandboxPolicyManager,
  approvalMode?: string,
): SandboxManager {
  if (approvalMode === 'yolo') {
    return new NoopSandboxManager();
  }

  const isWindows = os.platform() === 'win32';

  if (
    isWindows &&
    (sandbox?.enabled || sandbox?.command === 'windows-native')
  ) {
    return new WindowsSandboxManager({ workspace });
  }

  if (sandbox?.enabled) {
    if (os.platform() === 'linux') {
      return new LinuxSandboxManager({ workspace });
    }
    if (os.platform() === 'darwin') {
      const modeConfig =
        policyManager && approvalMode
          ? policyManager.getModeConfig(approvalMode)
          : undefined;
      return new MacOsSandboxManager({
        workspace,
        modeConfig,
        policyManager,
      });
    }
    return new LocalSandboxManager();
  }

  return new NoopSandboxManager();
}
