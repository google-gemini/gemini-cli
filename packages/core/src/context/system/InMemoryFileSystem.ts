/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IFileSystem } from './IFileSystem.js';

export class InMemoryFileSystem implements IFileSystem {
  private files = new Map<string, string | Buffer>();

  getFiles(): ReadonlyMap<string, string | Buffer> {
    return this.files;
  }

  setFile(path: string, content: string | Buffer) {
    this.files.set(this.normalize(path), content);
  }

  private normalize(p: string): string {
    return p.replace(/\/+/g, '/');
  }

  existsSync(p: string): boolean {
    return this.files.has(this.normalize(p));
  }

  statSyncSize(p: string): number {
    const content = this.files.get(this.normalize(p));
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, stat '${p}'`);
    }
    return Buffer.isBuffer(content)
      ? content.byteLength
      : Buffer.byteLength(content, 'utf8');
  }

  readFileSync(p: string, encoding: 'utf-8'): string {
    const content = this.files.get(this.normalize(p));
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${p}'`);
    }
    if (Buffer.isBuffer(content)) {
      return content.toString(encoding);
    }
    return content;
  }

  writeFileSync(p: string, data: string | Buffer, _encoding?: 'utf-8'): void {
    this.files.set(this.normalize(p), data);
  }

  appendFileSync(p: string, data: string, _encoding: 'utf-8'): void {
    const norm = this.normalize(p);
    const existing = this.files.get(norm) || '';
    const existingStr = Buffer.isBuffer(existing)
      ? existing.toString('utf8')
      : existing;
    this.files.set(norm, existingStr + data);
  }

  mkdirSync(_p: string, _options?: { recursive?: boolean }): void {}

  async readFile(p: string, encoding?: 'utf-8'): Promise<string> {
    return this.readFileSync(p, encoding ?? 'utf-8');
  }

  async writeFile(p: string, data: string | Buffer): Promise<void> {
    this.writeFileSync(p, data);
  }

  async mkdir(_p: string, _options?: { recursive?: boolean }): Promise<void> {}

  join(...paths: string[]): string {
    return this.normalize(paths.join('/'));
  }

  dirname(p: string): string {
    const parts = this.normalize(p).split('/');
    parts.pop();
    return parts.length === 0 ? '.' : parts.join('/') || '/';
  }
}
