/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolFilter } from './toolFilter.js';
import type { ToolFilterConfig } from './toolFilter.js';
import type { FunctionDeclaration } from '@google/genai';

function makeTools(names: string[]): FunctionDeclaration[] {
  return names.map((name) => ({
    name,
    description: `Tool: ${name}`,
  }));
}

function makeConfig(
  overrides: Partial<ToolFilterConfig> = {},
): ToolFilterConfig {
  return {
    enabled: false,
    model: 'functiongemma:270m',
    maxContextMessages: 3,
    fallbackBehavior: 'all-tools',
    cacheResults: true,
    cacheTtl: 30000,
    ...overrides,
  };
}

function makeFetchMock(response: unknown): typeof fetch {
  return vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
    }),
  ) as unknown as typeof fetch;
}

describe('ToolFilter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns all tools when disabled', async () => {
    const filter = new ToolFilter(
      makeConfig({ enabled: false }),
      'http://localhost:11434',
    );
    const tools = makeTools(['read_file', 'write_file', 'run_shell']);
    const result = await filter.filterTools(tools, [], 'test query');
    expect(result).toEqual(tools);
  });

  it('returns all tools on fetch failure with all-tools fallback', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new Error('connection refused'));
    const filter = new ToolFilter(
      makeConfig({ enabled: true, fallbackBehavior: 'all-tools' }),
      'http://localhost:11434/v1',
      mockFetch as unknown as typeof fetch,
    );
    const tools = makeTools(['read_file', 'write_file']);
    const result = await filter.filterTools(tools, [], 'query');
    expect(result).toEqual(tools);
  });

  it('returns empty on fetch failure with no-tools fallback', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('timeout'));
    const filter = new ToolFilter(
      makeConfig({ enabled: true, fallbackBehavior: 'no-tools' }),
      'http://localhost:11434/v1',
      mockFetch as unknown as typeof fetch,
    );
    const result = await filter.filterTools(makeTools(['read_file']), [], 'q');
    expect(result).toEqual([]);
  });

  it('returns core-only tools on core-only fallback', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('fail'));
    const filter = new ToolFilter(
      makeConfig({ enabled: true, fallbackBehavior: 'core-only' }),
      'http://localhost:11434/v1',
      mockFetch as unknown as typeof fetch,
    );
    const tools = makeTools([
      'read_file',
      'write_file',
      'edit_file',
      'custom_tool_1',
    ]);
    const result = await filter.filterTools(tools, [], 'q');
    const names = result.map((t) => t.name);
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('edit_file');
    expect(names).not.toContain('custom_tool_1');
  });

  it('filters tools based on FunctionGemma response', async () => {
    const mockFetch = makeFetchMock({
      message: { content: '["read_file", "write_file"]' },
    });
    const filter = new ToolFilter(
      makeConfig({ enabled: true }),
      'http://localhost:11434/v1',
      mockFetch,
    );
    const tools = makeTools(['read_file', 'write_file', 'run_shell']);
    const result = await filter.filterTools(tools, [], 'read a file');
    expect(result.map((t) => t.name)).toEqual(['read_file', 'write_file']);
  });

  it('caches filtered results', async () => {
    const mockFetch = makeFetchMock({
      message: { content: '["read_file"]' },
    });
    const filter = new ToolFilter(
      makeConfig({ enabled: true, cacheResults: true, cacheTtl: 60000 }),
      'http://localhost:11434/v1',
      mockFetch,
    );
    const tools = makeTools(['read_file', 'run_shell']);
    const result1 = await filter.filterTools(tools, [], 'test');
    const result2 = await filter.filterTools(tools, [], 'test');
    expect(result1).toEqual(result2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('validates tool names from FunctionGemma', async () => {
    const mockFetch = makeFetchMock({
      message: { content: '["read_file", "unknown_tool", "write_file"]' },
    });
    const filter = new ToolFilter(
      makeConfig({ enabled: true }),
      'http://localhost:11434/v1',
      mockFetch,
    );
    const tools = makeTools(['read_file', 'write_file']);
    const result = await filter.filterTools(tools, [], 'test');
    expect(result.map((t) => t.name)).toEqual(['read_file', 'write_file']);
  });

  it('handles malformed JSON in FunctionGemma response', async () => {
    const mockFetch = makeFetchMock({
      message: { content: 'not json at all' },
    });
    const filter = new ToolFilter(
      makeConfig({ enabled: true, fallbackBehavior: 'no-tools' }),
      'http://localhost:11434/v1',
      mockFetch,
    );
    const result = await filter.filterTools(makeTools(['read_file']), [], 'q');
    expect(result).toEqual([]);
  });

  it('clears cache', async () => {
    const mockFetch = makeFetchMock({
      message: { content: '["read_file"]' },
    });
    const filter = new ToolFilter(
      makeConfig({ enabled: true, cacheResults: true, cacheTtl: 60000 }),
      'http://localhost:11434/v1',
      mockFetch,
    );
    await filter.filterTools(makeTools(['read_file']), [], 'test');
    filter.clearCache();
    await filter.filterTools(makeTools(['read_file']), [], 'test');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('skips fetching for empty tool list', async () => {
    const mockFetch = vi.fn();
    const filter = new ToolFilter(
      makeConfig({ enabled: true }),
      'http://localhost:11434/v1',
      mockFetch as unknown as typeof fetch,
    );
    const result = await filter.filterTools([], [], 'test');
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
