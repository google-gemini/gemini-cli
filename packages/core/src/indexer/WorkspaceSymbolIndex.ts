/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SymbolDefinition, SymbolKind } from './SymbolModel.js';
import { SymbolExtractor } from './SymbolExtractor.js';

export const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go']);
export const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.venv',
  '__pycache__',
  '.zoe',
]);

export interface IndexStats {
  filesIndexed: number;
  totalSymbols: number;
  byKind: Record<SymbolKind, number>;
}

export class WorkspaceSymbolIndex {
  private workspaceRoot: string;
  private symbolsByName = new Map<string, SymbolDefinition[]>();
  private allSymbols: SymbolDefinition[] = [];
  private indexedFiles = new Set<string>();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  public indexWorkspace(maxFiles = 500): number {
    this.symbolsByName.clear();
    this.allSymbols = [];
    this.indexedFiles.clear();

    const walk = (dir: string): void => {
      if (this.indexedFiles.size >= maxFiles) return;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_e) {
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name)) {
            walk(path.join(dir, entry.name));
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(this.workspaceRoot, fullPath);
            try {
              const code = fs.readFileSync(fullPath, 'utf8');
              this.indexFile(relPath, code);
              this.indexedFiles.add(relPath);
            } catch (_e) {
              // Ignore unreadable file
            }
          }
        }
      }
    };

    if (fs.existsSync(this.workspaceRoot)) {
      walk(this.workspaceRoot);
    }

    return this.allSymbols.length;
  }

  public indexFile(filePath: string, code: string): SymbolDefinition[] {
    const symbols = SymbolExtractor.extract(code, filePath);
    for (const sym of symbols) {
      const key = sym.name.toLowerCase();
      const list = this.symbolsByName.get(key) ?? [];
      list.push(sym);
      this.symbolsByName.set(key, list);
      this.allSymbols.push(sym);
    }
    return symbols;
  }

  public find(query: string, kind?: SymbolKind): SymbolDefinition[] {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return kind ? this.allSymbols.filter((s) => s.kind === kind) : [...this.allSymbols];
    }

    // Exact matches first
    const exact = this.symbolsByName.get(trimmed) ?? [];

    // Partial matches
    const partial: SymbolDefinition[] = [];
    for (const [key, syms] of this.symbolsByName.entries()) {
      if (key !== trimmed && (key.includes(trimmed) || trimmed.includes(key))) {
        partial.push(...syms);
      }
    }

    const merged = [...exact, ...partial];
    if (kind) {
      return merged.filter((s) => s.kind === kind);
    }
    return merged;
  }

  public getStats(): IndexStats {
    const byKind: Record<SymbolKind, number> = {
      class: 0,
      interface: 0,
      type: 0,
      function: 0,
      method: 0,
      variable: 0,
    };

    for (const sym of this.allSymbols) {
      byKind[sym.kind] = (byKind[sym.kind] || 0) + 1;
    }

    return {
      filesIndexed: this.indexedFiles.size,
      totalSymbols: this.allSymbols.length,
      byKind,
    };
  }

  public formatTable(symbols: SymbolDefinition[], limit = 25): string {
    if (symbols.length === 0) {
      return 'No matching symbols found.';
    }

    const sliced = symbols.slice(0, limit);
    const lines: string[] = [
      `Found ${symbols.length} symbol${symbols.length === 1 ? '' : 's'}${symbols.length > limit ? ` (showing first ${limit})` : ''}:`,
      '',
      'KIND        SYMBOL                          LOCATION',
      '─────────── ─────────────────────────────── ──────────────────────────────',
    ];

    for (const s of sliced) {
      const kindStr = s.kind.toUpperCase().padEnd(11);
      const nameStr = s.name.slice(0, 31).padEnd(31);
      const locStr = `${s.file}:${s.line}`;
      lines.push(`${kindStr} ${nameStr} ${locStr}`);
    }

    return lines.join('\n');
  }
}
