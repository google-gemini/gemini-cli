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
import { WindowsSandboxManager } from '../sandbox/windows/WindowsSandboxManager.js';
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

  const modeConfig =
    policyManager && approvalMode
      ? policyManager.getModeConfig(approvalMode)
      : undefined;

  if (sandbox?.enabled) {
    if (os.platform() === 'win32' && sandbox?.command === 'windows-native') {
      return new WindowsSandboxManager({
        workspace,
        modeConfig,
        policyManager,
      });
    } else if (os.platform() === 'linux') {
      return new LinuxSandboxManager({
        workspace,
        modeConfig,
        policyManager,
      });
    } else if (os.platform() === 'darwin') {
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
