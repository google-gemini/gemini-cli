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

/**
 * Creates a sandbox manager based on the provided settings.
 */
export function createSandboxManager(
  sandbox: SandboxConfig | undefined,
  workspace: string,
): SandboxManager {
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
      return new MacOsSandboxManager({ workspace });
    }
    return new LocalSandboxManager();
  }

  return new NoopSandboxManager();
}
