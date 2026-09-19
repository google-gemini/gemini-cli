/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ASTAnalysisService,
  extractSymbols,
  findClosingBrace,
  findIndentEnd,
} from './astAnalysisService.js';

describe('ASTAnalysisService', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-svc-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('findClosingBrace', () => {
    it('should find the closing brace of a simple block', () => {
      const lines = ['function f() {', '  return 1;', '}'];
      expect(findClosingBrace(lines, 0)).toBe(2);
    });

    it('should handle nested braces correctly', () => {
      const lines = [
        'class C {',
        '  m() {',
        '    if (x) {',
        '    }',
        '  }',
        '}',
      ];
      expect(findClosingBrace(lines, 0)).toBe(5);
      expect(findClosingBrace(lines, 1)).toBe(4);
    });

    it('should ignore braces inside string literals', () => {
      const lines = ['function f() {', '  const s = "}{";', '}'];
      expect(findClosingBrace(lines, 0)).toBe(2);
    });
  });

  describe('findIndentEnd', () => {
    it('should find the end of a Python indentation block', () => {
      const lines = ['def f():', '    x = 1', '    return x', 'def g():'];
      expect(findIndentEnd(lines, 0)).toBe(2);
    });

    it('should skip blank lines within a block', () => {
      const lines = ['def f():', '    x = 1', '', '    y = 2', 'z = 3'];
      expect(findIndentEnd(lines, 0)).toBe(3);
    });
  });

  describe('extractSymbols', () => {
    it('should extract TypeScript class with methods', () => {
      const lines = [
        'export class MyService {',
        '  private val: number;',
        '  public process(x: string): void {',
        '    console.log(x);',
        '  }',
        '}',
      ];
      const syms = extractSymbols(lines, 'typescript');
      expect(syms).toHaveLength(1);
      expect(syms[0].name).toBe('MyService');
      expect(syms[0].kind).toBe('class');
      expect(syms[0].children.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract standalone functions', () => {
      const lines = [
        'export function doWork() {',
        '  return 42;',
        '}',
        '',
        'export async function fetchData() {',
        '  return null;',
        '}',
      ];
      const syms = extractSymbols(lines, 'typescript');
      expect(syms).toHaveLength(2);
      expect(syms[0].name).toBe('doWork');
      expect(syms[1].name).toBe('fetchData');
    });

    it('should extract interfaces and types', () => {
      const lines = [
        'export interface Config {',
        '  host: string;',
        '}',
        'export type Status = "ok" | "err";',
      ];
      const syms = extractSymbols(lines, 'typescript');
      expect(
        syms.some((s) => s.name === 'Config' && s.kind === 'interface'),
      ).toBe(true);
      expect(syms.some((s) => s.name === 'Status' && s.kind === 'type')).toBe(
        true,
      );
    });

    it('should extract Python classes and functions', () => {
      const lines = [
        'class Handler:',
        '    def run(self):',
        '        pass',
        'def util():',
        '    pass',
      ];
      const syms = extractSymbols(lines, 'python');
      expect(syms).toHaveLength(2);
      expect(syms[0].name).toBe('Handler');
      expect(syms[0].kind).toBe('class');
      expect(syms[0].children).toHaveLength(1);
      expect(syms[0].children[0].name).toBe('run');
      expect(syms[0].children[0].kind).toBe('method');
      expect(syms[1].name).toBe('util');
    });

    it('should skip comments and imports', () => {
      const lines = [
        '// comment',
        'import { X } from "y";',
        'export function real() {',
        '  return 1;',
        '}',
      ];
      const syms = extractSymbols(lines, 'typescript');
      expect(syms).toHaveLength(1);
      expect(syms[0].name).toBe('real');
    });

    it('should return empty array for empty input', () => {
      expect(extractSymbols([], 'typescript')).toHaveLength(0);
    });

    it('should truncate long signatures', () => {
      const longLine = 'export function ' + 'a'.repeat(130) + '() {';
      const syms = extractSymbols([longLine, '}'], 'typescript');
      expect(syms).toHaveLength(1);
      expect(syms[0].signature.length).toBeLessThanOrEqual(120);
    });
  });

  describe('getFileOutline', () => {
    it('should outline a TypeScript file from disk', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'svc.ts'),
        'export class Svc {\n  run() {\n    return 1;\n  }\n}\nexport function helper() {\n  return 2;\n}\n',
      );
      const service = new ASTAnalysisService(tmpDir);
      const outline = await service.getFileOutline('svc.ts');
      expect(outline).not.toBeNull();
      expect(outline!.language).toBe('typescript');
      expect(outline!.symbols.length).toBeGreaterThanOrEqual(2);
    });

    it('should return null for unsupported extensions', async () => {
      await fs.writeFile(path.join(tmpDir, 'data.json'), '{}');
      const service = new ASTAnalysisService(tmpDir);
      expect(await service.getFileOutline('data.json')).toBeNull();
    });

    it('should return null for missing files', async () => {
      const service = new ASTAnalysisService(tmpDir);
      expect(await service.getFileOutline('nope.ts')).toBeNull();
    });
  });

  describe('findSymbolBounds', () => {
    it('should locate a class precisely', async () => {
      const content = [
        'import { X } from "x";',
        '',
        'export class Target {',
        '  method() {',
        '    return 1;',
        '  }',
        '}',
        '',
        'export function other() {}',
      ].join('\n');
      await fs.writeFile(path.join(tmpDir, 'f.ts'), content);
      const svc = new ASTAnalysisService(tmpDir);
      const bounds = await svc.findSymbolBounds('f.ts', 'Target');
      expect(bounds).not.toBeNull();
      expect(bounds!.startLine).toBe(3);
      expect(bounds!.endLine).toBe(7);
    });

    it('should return null for a non-existent symbol', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'f.ts'),
        'export function real() {}\n',
      );
      const svc = new ASTAnalysisService(tmpDir);
      expect(await svc.findSymbolBounds('f.ts', 'ghost')).toBeNull();
    });
  });

  describe('getCodebaseMap', () => {
    it('should map multiple source files', async () => {
      const src = path.join(tmpDir, 'src');
      await fs.mkdir(src);
      await fs.writeFile(path.join(src, 'a.ts'), 'export class A {}\n');
      await fs.writeFile(path.join(src, 'b.ts'), 'export function b() {}\n');
      await fs.writeFile(path.join(src, 'c.json'), '{}');

      const svc = new ASTAnalysisService(tmpDir);
      const map = await svc.getCodebaseMap();
      expect(map).toContain('Codebase Map:');
      expect(map).toContain('class A');
      expect(map).toContain('function b');
      expect(map).not.toContain('.json');
    });

    it('should skip node_modules', async () => {
      const nm = path.join(tmpDir, 'node_modules', 'pkg');
      await fs.mkdir(nm, { recursive: true });
      await fs.writeFile(path.join(nm, 'index.ts'), 'export class X {}\n');
      await fs.writeFile(
        path.join(tmpDir, 'main.ts'),
        'export class Main {}\n',
      );

      const svc = new ASTAnalysisService(tmpDir);
      const map = await svc.getCodebaseMap();
      expect(map).toContain('Main');
      expect(map).not.toContain('node_modules');
    });
  });

  describe('shouldIgnore callback', () => {
    it('getFileOutline should return null for ignored files', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'secret.ts'),
        'export class Secret {}\n',
      );
      const ignoreFn = (p: string) => p.includes('secret');
      const svc = new ASTAnalysisService(tmpDir, ignoreFn);
      expect(await svc.getFileOutline('secret.ts')).toBeNull();
    });

    it('getFileOutline should still work for non-ignored files', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'public.ts'),
        'export class Public {}\n',
      );
      const ignoreFn = (p: string) => p.includes('secret');
      const svc = new ASTAnalysisService(tmpDir, ignoreFn);
      const outline = await svc.getFileOutline('public.ts');
      expect(outline).not.toBeNull();
      expect(outline!.symbols[0].name).toBe('Public');
    });

    it('getCodebaseMap should exclude ignored files', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'visible.ts'),
        'export class Visible {}\n',
      );
      await fs.writeFile(
        path.join(tmpDir, 'hidden.ts'),
        'export class Hidden {}\n',
      );
      const ignoreFn = (p: string) => p.includes('hidden');
      const svc = new ASTAnalysisService(tmpDir, ignoreFn);
      const map = await svc.getCodebaseMap();
      expect(map).toContain('Visible');
      expect(map).not.toContain('Hidden');
    });

    it('findSymbolBounds should return null for ignored files', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'ignored.ts'),
        'export function target() { return 1; }\n',
      );
      const ignoreFn = (p: string) => p.includes('ignored');
      const svc = new ASTAnalysisService(tmpDir, ignoreFn);
      expect(await svc.findSymbolBounds('ignored.ts', 'target')).toBeNull();
    });
  });
});
