/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface IFileSystem {
  existsSync(path: string): boolean;
  statSyncSize(path: string): number;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string | Buffer, encoding?: 'utf-8'): void;
  appendFileSync(path: string, data: string, encoding: 'utf-8'): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;

  writeFile(path: string, data: string | Buffer): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  join(...paths: string[]): string;
  dirname(path: string): string;
}
