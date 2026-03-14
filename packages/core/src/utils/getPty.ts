/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';

export type PtyImplementation = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  module: any;
  name: 'lydell-node-pty' | 'node-pty';
} | null;

export interface PtyProcess {
  readonly pid: number;
  onData(callback: (data: string) => void): void;
  onExit(callback: (e: { exitCode: number; signal?: number }) => void): void;
  kill(signal?: string): void;
}

export const getPty = async (): Promise<PtyImplementation> => {
  if (process.env['GEMINI_PTY_INFO'] === 'child_process') {
    return null;
  }

  const preferNodePty =
    process.platform === 'linux' && existsSync('/etc/alpine-release');
  const candidates = preferNodePty
    ? ([
        ['node-pty', 'node-pty'],
        ['@lydell/node-pty', 'lydell-node-pty'],
      ] as const)
    : ([
        ['@lydell/node-pty', 'lydell-node-pty'],
        ['node-pty', 'node-pty'],
      ] as const);

  for (const [pkg, name] of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const module = await import(pkg);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      return { module, name };
    } catch (_e) {
      continue;
    }
  }

  return null;
};
