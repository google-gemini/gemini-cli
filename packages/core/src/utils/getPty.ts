/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
  try {
    const lydell = '@lydell/node-pty';
    const module = await import(lydell);
    return { module, name: 'lydell-node-pty' };
  } catch (_e) {
    try {
      const nodePty = 'node-pty';
      const module = await import(nodePty);
      return { module, name: 'node-pty' };
    } catch (_e2) {
      return null;
    }
  }
};
