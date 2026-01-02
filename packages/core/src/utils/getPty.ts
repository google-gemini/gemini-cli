/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScriptPtyModule } from './pty/ScriptPty.js';
import type { PtyModule } from './pty/types.js';
import { spawn } from 'node:child_process';

export type PtyImplementation = {
  module: PtyModule;
  name: 'lydell-node-pty' | 'node-pty' | 'script-pty';
} | null;

const checkScriptCommand = async (): Promise<boolean> =>
  new Promise((resolve) => {
    // Use POSIX 'command -v' to check if script exists
    const check = spawn('sh', ['-c', 'command -v script'], { stdio: 'ignore' });
    check.on('error', () => resolve(false));
    check.on('exit', (code) => resolve(code === 0));
  });

const getNodePty = async (): Promise<PtyImplementation> => {
  try {
    const lydell = '@lydell/node-pty';
    const module = await import(lydell);
    return { module: module.default || module, name: 'lydell-node-pty' };
  } catch (_e) {
    try {
      const nodePty = 'node-pty';
      const module = await import(nodePty);
      return { module: module.default || module, name: 'node-pty' };
    } catch (_e2) {
      return null;
    }
  }
};

export const getPty = async (
  backend: string = 'auto',
): Promise<PtyImplementation> => {
  if (backend === 'none') {
    return null;
  }

  if (backend === 'auto' || backend === 'node-pty') {
    const nodePty = await getNodePty();
    if (nodePty) {
      return nodePty;
    }
    if (backend === 'node-pty') {
      return null;
    }
  }

  if (backend === 'auto' || backend === 'script') {
    const hasScript = await checkScriptCommand();
    if (hasScript) {
      return { module: ScriptPtyModule, name: 'script-pty' };
    }
  }

  return null;
};
