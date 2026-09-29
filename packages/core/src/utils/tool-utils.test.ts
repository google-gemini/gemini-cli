/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import {
  doesToolInvocationMatch,
  getToolSuggestion,
  truncateToolOutput,
  truncateFunctionResponsePart,
} from './tool-utils.js';
import type { Part } from '@google/genai';
import { MAX_STORED_TOOL_OUTPUT_BYTES } from './constants.js';
import { ReadFileTool, type AnyToolInvocation, type Config } from '../index.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

describe('getToolSuggestion', () => {
  it('should suggest the top N closest tool names for a typo', () => {
    const allToolNames = ['list_files', 'read_file', 'write_file'];

    // Test that the right tool is selected, with only 1 result, for typos
    const misspelledTool = getToolSuggestion('list_fils', allToolNames, 1);
    expect(misspelledTool).toBe(' Did you mean "list_files"?');

    // Test that the right tool is selected, with only 1 result, for prefixes
    const prefixedTool = getToolSuggestion(
      'github.list_files',
      allToolNames,
      1,
    );
    expect(prefixedTool).toBe(' Did you mean "list_files"?');

    // Test that the right tool is first
    const suggestionMultiple = getToolSuggestion('list_fils', allToolNames);
    expect(suggestionMultiple).toBe(
      ' Did you mean one of: "list_files", "read_file", "write_file"?',
    );
  });
});

describe('doesToolInvocationMatch', () => {
  it('should not match a partial command prefix', () => {
    const invocation = {
      params: { command: 'git commitsomething' },
    } as AnyToolInvocation;
    const patterns = ['ShellTool(git commit)'];
    const result = doesToolInvocationMatch(
      'run_shell_command',
      invocation,
      patterns,
    );
    expect(result).toBe(false);
  });

  it('should match an exact command', () => {
    const invocation = {
      params: { command: 'git status' },
    } as AnyToolInvocation;
    const patterns = ['ShellTool(git status)'];
    const result = doesToolInvocationMatch(
      'run_shell_command',
      invocation,
      patterns,
    );
    expect(result).toBe(true);
  });

  it('should match a command with an alias', () => {
    const invocation = {
      params: { command: 'wc -l' },
    } as AnyToolInvocation;
    const patterns = ['ShellTool(wc)'];
    const result = doesToolInvocationMatch('ShellTool', invocation, patterns);
    expect(result).toBe(true);
  });

  it('should match a command that is a prefix', () => {
    const invocation = {
      params: { command: 'git status -v' },
    } as AnyToolInvocation;
    const patterns = ['ShellTool(git status)'];
    const result = doesToolInvocationMatch(
      'run_shell_command',
      invocation,
      patterns,
    );
    expect(result).toBe(true);
  });

  describe('for non-shell tools', () => {
    const mockConfig = {
      getTargetDir: () => '/tmp',
      getFileFilteringOptions: () => ({}),
    } as unknown as Config;
    const readFileTool = new ReadFileTool(mockConfig, createMockMessageBus());
    const invocation = {
      params: { file: 'test.txt' },
    } as AnyToolInvocation;

    it('should match by tool name', () => {
      const patterns = ['read_file'];
      const result = doesToolInvocationMatch(
        readFileTool,
        invocation,
        patterns,
      );
      expect(result).toBe(true);
    });

    it('should match by tool class name', () => {
      const patterns = ['ReadFileTool'];
      const result = doesToolInvocationMatch(
        readFileTool,
        invocation,
        patterns,
      );
      expect(result).toBe(true);
    });

    it('should not match if neither name is in the patterns', () => {
      const patterns = ['some_other_tool', 'AnotherToolClass'];
      const result = doesToolInvocationMatch(
        readFileTool,
        invocation,
        patterns,
      );
      expect(result).toBe(false);
    });

    it('should match by tool name when passed as a string', () => {
      const patterns = ['read_file'];
      const result = doesToolInvocationMatch('read_file', invocation, patterns);
      expect(result).toBe(true);
    });
  });
});

describe('truncateToolOutput', () => {
  it('preserves text when within maxBytes limit', () => {
    const input = 'short text';
    expect(truncateToolOutput(input, 100)).toBe(input);
  });

  it('truncates ASCII text exceeding maxBytes and appends indicator', () => {
    const input = 'a'.repeat(200);
    const maxBytes = 100;
    const result = truncateToolOutput(input, maxBytes);

    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(maxBytes);
    expect(result).toContain(
      '\n... [Tool output truncated to conserve memory]',
    );
  });

  it('handles multi-byte graphemes cleanly without breaking clusters or creating replacement characters', () => {
    // 👩‍👩‍👦‍👦 consists of 4 people emojis connected with Zero Width Joiner (\u200D), totaling 25 UTF-8 bytes.
    const familyEmoji = '👩‍👩‍👦‍👦';
    const accented = 'caffè';
    const suffix = '\n... [Tool output truncated to conserve memory]';
    const suffixBytes = Buffer.byteLength(suffix, 'utf8');

    // Case 1: Not enough space for the full 25-byte emoji
    // Available space for text is 10 bytes (< 25 bytes), input is 135 bytes
    const inputLong = familyEmoji + ' extra text'.repeat(10);
    const tightMaxBytes = suffixBytes + 10;
    const resultTight = truncateToolOutput(inputLong, tightMaxBytes);
    expect(resultTight).toBe(suffix);
    expect(resultTight.includes('\uFFFD')).toBe(false);
    expect(Buffer.byteLength(resultTight, 'utf8')).toBeLessThanOrEqual(
      tightMaxBytes,
    );

    // Case 2: Enough space for the emoji, but not enough for following text
    const emojiBytes = Buffer.byteLength(familyEmoji, 'utf8');
    const exactMaxBytes = suffixBytes + emojiBytes;
    const resultExact = truncateToolOutput(inputLong, exactMaxBytes);
    expect(resultExact).toBe(familyEmoji + suffix);
    expect(resultExact.includes('\uFFFD')).toBe(false);
    expect(Buffer.byteLength(resultExact, 'utf8')).toBeLessThanOrEqual(
      exactMaxBytes,
    );

    // Case 3: Large text with mixed emojis and accented characters
    const largeMixed = `${familyEmoji} ${accented} `.repeat(2000);
    const resultLarge = truncateToolOutput(
      largeMixed,
      MAX_STORED_TOOL_OUTPUT_BYTES,
    );
    expect(Buffer.byteLength(resultLarge, 'utf8')).toBeLessThanOrEqual(
      MAX_STORED_TOOL_OUTPUT_BYTES,
    );
    expect(resultLarge).toContain(suffix);
    expect(resultLarge.includes('\uFFFD')).toBe(false);
    expect(Buffer.from(resultLarge, 'utf8').toString('utf8')).toBe(resultLarge);
  });
});

describe('truncateFunctionResponsePart', () => {
  it('recursively deep-truncates nested objects and arrays while leaving small values untouched', () => {
    const largeA = 'A'.repeat(100_000);
    const largeB = 'B'.repeat(100_000);
    const largeC = 'C'.repeat(100_000);
    const suffix = '\n... [Tool output truncated to conserve memory]';

    const part: Part = {
      functionResponse: {
        name: 'complexTool',
        response: {
          details: { logs: largeA, status: 'ok', count: 42 },
          items: [largeB, 'small item', true],
          deep: { a: [{ b: { c: largeC, flag: false } }] },
        },
      },
    };

    const truncatedPart = truncateFunctionResponsePart(
      part,
      MAX_STORED_TOOL_OUTPUT_BYTES,
    );
    const res = truncatedPart.functionResponse?.response as Record<
      string,
      unknown
    >;

    expect(res).toBeDefined();

    // Nested object check: logs is truncated, status and count are untouched
    const details = res['details'] as {
      logs: string;
      status: string;
      count: number;
    };
    expect(typeof details.logs).toBe('string');
    expect(details.logs.endsWith(suffix)).toBe(true);
    expect(Buffer.byteLength(details.logs, 'utf8')).toBeLessThanOrEqual(
      MAX_STORED_TOOL_OUTPUT_BYTES,
    );
    expect(details.status).toBe('ok');
    expect(details.count).toBe(42);

    // Nested array check: large string item is truncated, small item and boolean untouched
    const items = res['items'] as [string, string, boolean];
    const firstItem = items[0];
    expect(typeof firstItem).toBe('string');
    expect(firstItem.endsWith(suffix)).toBe(true);
    expect(Buffer.byteLength(firstItem, 'utf8')).toBeLessThanOrEqual(
      MAX_STORED_TOOL_OUTPUT_BYTES,
    );
    expect(items[1]).toBe('small item');
    expect(items[2]).toBe(true);

    // Deeply nested check: deep.a[0].b.c is truncated, flag is untouched
    const deep = res['deep'] as {
      a: Array<{ b: { c: string; flag: boolean } }>;
    };
    const nestedC = deep.a[0].b.c;
    expect(typeof nestedC).toBe('string');
    expect(nestedC.endsWith(suffix)).toBe(true);
    expect(Buffer.byteLength(nestedC, 'utf8')).toBeLessThanOrEqual(
      MAX_STORED_TOOL_OUTPUT_BYTES,
    );
    expect(deep.a[0].b.flag).toBe(false);
  });

  it('returns original part reference when no nested truncation was needed', () => {
    const part: Part = {
      functionResponse: {
        name: 'smallTool',
        response: {
          details: { logs: 'short' },
          items: ['item1', 123],
        },
      },
    };

    const result = truncateFunctionResponsePart(
      part,
      MAX_STORED_TOOL_OUTPUT_BYTES,
    );
    expect(result).toBe(part);
  });

  it('leaves Buffer, Uint8Array, and non-plain object payloads intact without converting to dictionary objects', () => {
    const bufferPayload = Buffer.from('raw binary content \x00\x01\x02');
    const uint8Payload = new Uint8Array([10, 20, 30, 40]);
    const datePayload = new Date(1700000000000);
    const regexPayload = /test-pattern/gi;

    const part: Part = {
      functionResponse: {
        name: 'binaryTool',
        response: {
          buf: bufferPayload,
          uint8: uint8Payload,
          createdAt: datePayload,
          pattern: regexPayload,
          nested: {
            subBuf: bufferPayload,
            largeString: 'A'.repeat(100_000),
          },
        },
      },
    };

    const result = truncateFunctionResponsePart(
      part,
      MAX_STORED_TOOL_OUTPUT_BYTES,
    );
    const res = result.functionResponse?.response as {
      buf: Buffer;
      uint8: Uint8Array;
      createdAt: Date;
      pattern: RegExp;
      nested: { subBuf: Buffer; largeString: string };
    };

    expect(res).toBeDefined();
    // Verify instances are preserved and not turned into plain objects {}
    expect(Buffer.isBuffer(res.buf)).toBe(true);
    expect(Buffer.compare(res.buf, bufferPayload)).toBe(0);

    expect(res.uint8 instanceof Uint8Array).toBe(true);
    expect(Array.from(res.uint8)).toEqual([10, 20, 30, 40]);

    expect(res.createdAt instanceof Date).toBe(true);
    expect(res.createdAt.getTime()).toBe(1700000000000);

    expect(res.pattern instanceof RegExp).toBe(true);
    expect(res.pattern.source).toBe('test-pattern');

    expect(Buffer.isBuffer(res.nested.subBuf)).toBe(true);
    expect(
      res.nested.largeString.endsWith(
        '\n... [Tool output truncated to conserve memory]',
      ),
    ).toBe(true);
  });

  it('preserves primitive string response type when truncating', () => {
    const largeStr = 'S'.repeat(100_000);
    const part: Part = {
      functionResponse: {
        name: 'stringTool',
        response: largeStr as unknown as Record<string, unknown>,
      },
    };

    const truncated = truncateFunctionResponsePart(
      part,
      MAX_STORED_TOOL_OUTPUT_BYTES,
    );
    const res: unknown = truncated.functionResponse?.response;
    expect(typeof res).toBe('string');
    const strRes = res as string;
    expect(
      strRes.endsWith('\n... [Tool output truncated to conserve memory]'),
    ).toBe(true);
    expect(Buffer.byteLength(strRes, 'utf8')).toBeLessThanOrEqual(
      MAX_STORED_TOOL_OUTPUT_BYTES,
    );
  });
});
