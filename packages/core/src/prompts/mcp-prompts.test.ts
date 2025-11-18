/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../config/config.js';
import type { DiscoveredMCPPrompt } from '../tools/mcp-client.js';
import { getMCPServerPrompts } from './mcp-prompts.js';

describe('getMCPServerPrompts', () => {
  it('should return empty array when config has no prompt registry', () => {
    const mockConfig = {
      getPromptRegistry: vi.fn().mockReturnValue(null),
    } as unknown as Config;

    const result = getMCPServerPrompts(mockConfig, 'test-server');

    expect(result).toEqual([]);
    expect(mockConfig.getPromptRegistry).toHaveBeenCalledOnce();
  });

  it('should return empty array when config has undefined prompt registry', () => {
    const mockConfig = {
      getPromptRegistry: vi.fn().mockReturnValue(undefined),
    } as unknown as Config;

    const result = getMCPServerPrompts(mockConfig, 'test-server');

    expect(result).toEqual([]);
    expect(mockConfig.getPromptRegistry).toHaveBeenCalledOnce();
  });

  it('should return prompts from registry when available', () => {
    const mockPrompts: DiscoveredMCPPrompt[] = [
      { name: 'prompt1', description: 'Test prompt 1' } as DiscoveredMCPPrompt,
      { name: 'prompt2', description: 'Test prompt 2' } as DiscoveredMCPPrompt,
    ];

    const mockRegistry = {
      getPromptsByServer: vi.fn().mockReturnValue(mockPrompts),
    };

    const mockConfig = {
      getPromptRegistry: vi.fn().mockReturnValue(mockRegistry),
    } as unknown as Config;

    const result = getMCPServerPrompts(mockConfig, 'test-server');

    expect(result).toEqual(mockPrompts);
    expect(mockRegistry.getPromptsByServer).toHaveBeenCalledOnce();
    expect(mockRegistry.getPromptsByServer).toHaveBeenCalledWith('test-server');
  });

  it('should pass correct server name to registry', () => {
    const mockRegistry = {
      getPromptsByServer: vi.fn().mockReturnValue([]),
    };

    const mockConfig = {
      getPromptRegistry: vi.fn().mockReturnValue(mockRegistry),
    } as unknown as Config;

    getMCPServerPrompts(mockConfig, 'my-custom-server');

    expect(mockRegistry.getPromptsByServer).toHaveBeenCalledWith(
      'my-custom-server',
    );
  });

  it('should return empty array when registry returns empty array', () => {
    const mockRegistry = {
      getPromptsByServer: vi.fn().mockReturnValue([]),
    };

    const mockConfig = {
      getPromptRegistry: vi.fn().mockReturnValue(mockRegistry),
    } as unknown as Config;

    const result = getMCPServerPrompts(mockConfig, 'server-with-no-prompts');

    expect(result).toEqual([]);
  });

  it('should handle multiple prompts correctly', () => {
    const mockPrompts = [
      { name: 'p1' } as DiscoveredMCPPrompt,
      { name: 'p2' } as DiscoveredMCPPrompt,
      { name: 'p3' } as DiscoveredMCPPrompt,
    ];

    const mockRegistry = {
      getPromptsByServer: vi.fn().mockReturnValue(mockPrompts),
    };

    const mockConfig = {
      getPromptRegistry: vi.fn().mockReturnValue(mockRegistry),
    } as unknown as Config;

    const result = getMCPServerPrompts(mockConfig, 'test');

    expect(result).toHaveLength(3);
    expect(result).toEqual(mockPrompts);
  });

  it('should call getPromptRegistry exactly once', () => {
    const mockConfig = {
      getPromptRegistry: vi.fn().mockReturnValue(null),
    } as unknown as Config;

    getMCPServerPrompts(mockConfig, 'test');

    expect(mockConfig.getPromptRegistry).toHaveBeenCalledTimes(1);
  });
});
