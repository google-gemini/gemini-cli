/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface IPty {
  readonly pid: number;
  readonly cols: number;
  readonly rows: number;
  readonly process: string;
  readonly handleFlowControl: boolean;

  onData(listener: (data: Buffer) => void): { dispose: () => void };
  onExit(listener: (e: { exitCode: number; signal?: number }) => void): {
    dispose: () => void;
  };
  resize(cols: number, rows: number): void;
  write(data: string): void;
  kill(signal?: string): void;
}

export interface PtySpawnOptions {
  name?: string;
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: { [key: string]: string };
  encoding?: string | null;
  handleFlowControl?: boolean;
}

export interface PtyModule {
  spawn(file: string, args: string[] | string, options: PtySpawnOptions): IPty;
}
