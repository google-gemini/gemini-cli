/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ASTSearchTool } from './ast-search.js';
import { AST_SEARCH_TOOL_NAME } from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { makeFakeConfig } from '../test-utils/config.js';

describe('ASTSearchTool', () => {
  let tmpDir: string;
  let mockMessageBus: MessageBus;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-tool-'));
    mockMessageBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
    } as unknown as MessageBus;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeTool() {
    const config = makeFakeConfig({ targetDir: tmpDir });
    return new ASTSearchTool(config, mockMessageBus);
  }

  describe('static properties', () => {
    it('should have the correct tool name', () => {
      expect(ASTSearchTool.Name).toBe(AST_SEARCH_TOOL_NAME);
    });

    it('should produce a valid schema', () => {
      const tool = makeTool();
      const schema = tool.getSchema();
      expect(schema.name).toBe(AST_SEARCH_TOOL_NAME);
      expect(schema.description).toBeDefined();
      expect(schema.parametersJsonSchema).toBeDefined();
    });
  });

  describe('symbol scope', () => {
    it('should find a class and return its line bounds', async () => {
      const content = [
        'import { X } from "x";',
        '',
        'export class TargetClass {',
        '  method() {',
        '    return 1;',
        '  }',
        '}',
      ].join('\n');
      await fs.writeFile(path.join(tmpDir, 'target.ts'), content);

      const tool = makeTool();
      const invocation = tool.build({
        symbol_name: 'TargetClass',
        file_path: 'target.ts',
        scope: 'symbol',
      });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.llmContent).toContain('TargetClass');
      expect(result.llmContent).toContain('Lines: 3-7');
      expect(result.llmContent).toContain('TIP: Use read_file');
    });

    it('should find a function', async () => {
      const content = [
        'export function processData(input: string): string {',
        '  return input.trim();',
        '}',
      ].join('\n');
      await fs.writeFile(path.join(tmpDir, 'utils.ts'), content);

      const tool = makeTool();
      const invocation = tool.build({
        symbol_name: 'processData',
        file_path: 'utils.ts',
      });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.llmContent).toContain('processData');
      expect(result.llmContent).toContain('Lines: 1-3');
    });

    it('should return a helpful message for missing symbols', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'empty.ts'),
        'export const x = 1;\n',
      );

      const tool = makeTool();
      const invocation = tool.build({
        symbol_name: 'NonExistent',
        file_path: 'empty.ts',
        scope: 'symbol',
      });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.llmContent).toContain('not found');
      expect(result.llmContent).toContain('grep_search');
    });

    it('should error when symbol_name is missing', async () => {
      await fs.writeFile(path.join(tmpDir, 'f.ts'), 'class A {}\n');

      const tool = makeTool();
      const invocation = tool.build({ file_path: 'f.ts', scope: 'symbol' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.llmContent).toContain('symbol_name is required');
    });

    it('should error when file_path is missing', async () => {
      const tool = makeTool();
      const invocation = tool.build({ symbol_name: 'X', scope: 'symbol' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.llmContent).toContain('file_path is required');
    });
  });

  describe('outline scope', () => {
    it('should return a file outline with symbols', async () => {
      const content = [
        'export interface Config {',
        '  host: string;',
        '}',
        '',
        'export class Server {',
        '  constructor() {}',
        '  public start(): void {',
        '    console.log("started");',
        '  }',
        '}',
        '',
        'export function createServer(): Server {',
        '  return new Server();',
        '}',
      ].join('\n');
      await fs.writeFile(path.join(tmpDir, 'server.ts'), content);

      const tool = makeTool();
      const invocation = tool.build({
        file_path: 'server.ts',
        scope: 'outline',
      });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.llmContent).toContain('server.ts');
      expect(result.llmContent).toContain('interface Config');
      expect(result.llmContent).toContain('class Server');
      expect(result.llmContent).toContain('function createServer');
    });

    it('should fail gracefully for unsupported file types', async () => {
      await fs.writeFile(path.join(tmpDir, 'data.txt'), 'hello');

      const tool = makeTool();
      const invocation = tool.build({
        file_path: 'data.txt',
        scope: 'outline',
      });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.llmContent).toContain('Could not outline');
    });
  });

  describe('map scope', () => {
    it('should generate a codebase map', async () => {
      const src = path.join(tmpDir, 'src');
      await fs.mkdir(src);
      await fs.writeFile(path.join(src, 'a.ts'), 'export class Alpha {}\n');
      await fs.writeFile(path.join(src, 'b.ts'), 'export function beta() {}\n');

      const tool = makeTool();
      const invocation = tool.build({ scope: 'map' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.llmContent).toContain('Codebase Map:');
      expect(result.llmContent).toContain('Alpha');
      expect(result.llmContent).toContain('beta');
    });

    it('should generate a map scoped to a subdirectory', async () => {
      const sub = path.join(tmpDir, 'pkg');
      await fs.mkdir(sub);
      await fs.writeFile(path.join(sub, 'c.ts'), 'export enum Status { OK }\n');
      await fs.writeFile(
        path.join(tmpDir, 'root.ts'),
        'export class Root {}\n',
      );

      const tool = makeTool();
      const invocation = tool.build({ file_path: 'pkg', scope: 'map' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.llmContent).toContain('Status');
    });
  });
});
