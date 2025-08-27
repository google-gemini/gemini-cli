/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpPromptLoader } from './McpPromptLoader.js';
import type { Config } from '@google/gemini-cli-core';
import type { PromptArgument } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect } from 'vitest';

describe('McpPromptLoader', () => {
  const mockConfig = {} as Config;

  describe('parseArgs', () => {
    it('should handle multi-word positional arguments', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'arg1', required: true },
        { name: 'arg2', required: true },
      ];
      const userArgs = 'hello world';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ arg1: 'hello', arg2: 'world' });
    });

    it('should handle quoted multi-word positional arguments', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'arg1', required: true },
        { name: 'arg2', required: true },
      ];
      const userArgs = '"hello world" foo';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ arg1: 'hello world', arg2: 'foo' });
    });

    it('should handle a single positional argument with multiple words', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [{ name: 'arg1', required: true }];
      const userArgs = 'hello world';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ arg1: 'hello world' });
    });

    it('should handle escaped quotes in positional arguments', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [{ name: 'arg1', required: true }];
      const userArgs = '"hello \\"world\\""';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ arg1: 'hello "world"' });
    });

    it('should handle escaped backslashes in positional arguments', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [{ name: 'arg1', required: true }];
      const userArgs = '"hello\\\\world"';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ arg1: 'hello\\world' });
    });

    it('should handle named args followed by positional args', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'named', required: true },
        { name: 'pos', required: true },
      ];
      const userArgs = '--named="value" positional';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ named: 'value', pos: 'positional' });
    });

    it('should handle positional args followed by named args', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'pos', required: true },
        { name: 'named', required: true },
      ];
      const userArgs = 'positional --named="value"';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ pos: 'positional', named: 'value' });
    });

    it('should handle positional args interspersed with named args', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'pos1', required: true },
        { name: 'named', required: true },
        { name: 'pos2', required: true },
      ];
      const userArgs = 'p1 --named="value" p2';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ pos1: 'p1', named: 'value', pos2: 'p2' });
    });

    it('should treat an escaped quote at the start as a literal', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'arg1', required: true },
        { name: 'arg2', required: true },
      ];
      const userArgs = '\\"hello world';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({ arg1: '"hello', arg2: 'world' });
    });

    it('should handle a complex mix of args', () => {
      const loader = new McpPromptLoader(mockConfig);
      const promptArgs: PromptArgument[] = [
        { name: 'pos1', required: true },
        { name: 'named1', required: true },
        { name: 'pos2', required: true },
        { name: 'named2', required: true },
        { name: 'pos3', required: true },
      ];
      const userArgs =
        'p1 --named1="value 1" "p2 has spaces" --named2=value2 "p3 \\"with quotes\\""';
      const result = loader.parseArgs(userArgs, promptArgs);
      expect(result).toEqual({
        pos1: 'p1',
        named1: 'value 1',
        pos2: 'p2 has spaces',
        named2: 'value2',
        pos3: 'p3 "with quotes"',
      });
    });
  });
});
