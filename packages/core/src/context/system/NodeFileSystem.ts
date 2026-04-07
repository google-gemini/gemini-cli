/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import type { IFileSystem } from './IFileSystem.js';

export class NodeFileSystem implements IFileSystem {
  existsSync(p: string): boolean {
    return fs.existsSync(p);
  }

  statSyncSize(p: string): number {
    return fs.statSync(p).size;
  }

  readFileSync(p: string, encoding: 'utf8'): string {
    return fs.readFileSync(p, encoding);
  }

  writeFileSync(p: string, data: string | Buffer, encoding?: 'utf-8'): void {
    if (Buffer.isBuffer(data)) {
      fs.writeFileSync(p, data);
    } else {
      fs.writeFileSync(p, data, encoding);
    }
  }

  appendFileSync(p: string, data: string, encoding: 'utf-8'): void {
    fs.appendFileSync(p, data, encoding);
  }

  mkdirSync(p: string, options?: { recursive?: boolean }): void {
    fs.mkdirSync(p, options);
  }

  async writeFile(p: string, data: string | Buffer): Promise<void> {
    await fsPromises.writeFile(p, data);
  }

  async mkdir(p: string, options?: { recursive?: boolean }): Promise<void> {
    await fsPromises.mkdir(p, options);
  }

  join(...paths: string[]): string {
    return path.join(...paths);
  }

  dirname(p: string): string {
    return path.dirname(p);
  }
}
