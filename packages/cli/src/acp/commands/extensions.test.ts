/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchExtensionsCommand } from './extensions.js';
import {
  ExtensionRegistryClient,
  type RegistryExtension,
} from '../../config/extensionRegistryClient.js';
import type { CommandContext } from './types.js';

vi.mock('../../config/extensionRegistryClient.js');

describe('SearchExtensionsCommand', () => {
  let command: SearchExtensionsCommand;
  let mockContext: CommandContext;

  beforeEach(() => {
    command = new SearchExtensionsCommand();
    mockContext = {
      config: {
        getExtensionRegistryURI: vi.fn().mockReturnValue(undefined),
      },
    } as unknown as CommandContext;
    vi.clearAllMocks();
  });

  it('should list top extensions when no args provided', async () => {
    const mockExtensions: Array<Partial<RegistryExtension>> = [
      {
        extensionName: 'Ext 1',
        fullName: 'user/ext1',
        extensionDescription: 'Desc 1',
        rank: 1,
        url: 'https://github.com/user/ext1',
        hasMCP: true,
      },
      {
        extensionName: 'Ext 2',
        fullName: 'user/ext2',
        extensionDescription: 'Desc 2',
        rank: 2,
        url: 'https://github.com/user/ext2',
        hasSkills: true,
      },
    ];

    vi.mocked(
      ExtensionRegistryClient.prototype.searchExtensions,
    ).mockResolvedValue(mockExtensions as RegistryExtension[]);

    const response = await command.execute(mockContext, []);

    expect(response.name).toBe('extensions search');
    expect(response.data).toContain('Top 2 available extensions:');
    expect(response.data).toContain('* Ext 1 (user/ext1)');
    expect(response.data).toContain('[MCP]');
    expect(response.data).toContain(
      '/extensions install https://github.com/user/ext1',
    );
    expect(response.data).toContain('* Ext 2 (user/ext2)');
    expect(response.data).toContain('[Skills]');
  });

  it('should search extensions when args provided', async () => {
    const mockExtensions: Array<Partial<RegistryExtension>> = [
      {
        extensionName: 'Search Ext',
        fullName: 'user/search-ext',
        extensionDescription: 'Matching description',
        rank: 5,
        url: 'https://github.com/user/search-ext',
      },
    ];

    vi.mocked(
      ExtensionRegistryClient.prototype.searchExtensions,
    ).mockResolvedValue(mockExtensions as RegistryExtension[]);

    const response = await command.execute(mockContext, ['search']);

    expect(
      vi.mocked(ExtensionRegistryClient.prototype.searchExtensions),
    ).toHaveBeenCalledWith('search');
    expect(response.data).toContain('Found 1 extensions matching "search":');
    expect(response.data).toContain('* Search Ext (user/search-ext)');
  });

  it('should show error message when fetch fails', async () => {
    vi.mocked(
      ExtensionRegistryClient.prototype.searchExtensions,
    ).mockRejectedValue(new Error('Network error'));

    const response = await command.execute(mockContext, []);

    expect(response.data).toContain(
      'Failed to fetch extensions: Network error',
    );
    expect(response.data).toContain('/extensions explore');
  });
});
