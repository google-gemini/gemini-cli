/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IFileSystem } from './IFileSystem.js';

export class InMemoryFileSystem implements IFileSystem {
  private files = new Map<string, string>();

  // Helper for tests
  getFiles(): ReadonlyMap<string, string> {
    return this.files;
  }

  // Helper for tests
  setFile(path: string, content: string) {
    this.files.set(this.normalize(path), content);
  }

  private normalize(p: string): string {
     // A very naive normalization for testing purposes.
     // Ensures '/foo/bar' and '/foo//bar' map to the same key.
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
    return content.length; // Naive char length = byte size for testing
  }
  
  readFileSync(p: string, encoding: 'utf8'): string {
    const content = this.files.get(this.normalize(p));
    if (content === undefined) {
       throw new Error(`ENOENT: no such file or directory, open '${p}'`);
    }
    return content;
  }
  
  writeFileSync(p: string, data: string, encoding: 'utf-8'): void {
    this.files.set(this.normalize(p), data);
  }
  
  appendFileSync(p: string, data: string, encoding: 'utf-8'): void {
    const norm = this.normalize(p);
    const existing = this.files.get(norm) || '';
    this.files.set(norm, existing + data);
  }
  
  mkdirSync(p: string, options?: { recursive?: boolean }): void {
    // In-memory fake doesn't track directories separately from files for our simple use cases
  }

  join(...paths: string[]): string {
    return this.normalize(paths.join('/'));
  }

  dirname(p: string): string {
    const parts = this.normalize(p).split('/');
    parts.pop();
    return parts.length === 0 ? '.' : parts.join('/') || '/';
  }
}
