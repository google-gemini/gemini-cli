/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ListResourcesTool,
  type ListResourcesToolParams,
} from './list-resources-tool.js';
import type { Config } from '../config/config.js';
import type { DiscoveredMCPResource } from './resource-registry.js';
import type { ToolInvocation, ToolResult } from '../tools/tools.js';

describe('ListResourcesTool', () => {
  let mockConfig: Partial<Config>;
  let tool: ListResourcesTool;
  let invocation: ToolInvocation<ListResourcesToolParams, ToolResult>;

  beforeEach(() => {
    mockConfig = {
      getResourceRegistry: vi.fn().mockReturnValue({
        getAllResources: vi.fn().mockReturnValue([]),
      }),
    } as unknown as Partial<Config>;
    tool = new ListResourcesTool(mockConfig as Config);
  });

  it('returns a helpful message when no resources exist', async () => {
    invocation = tool.build({});
    const result = await invocation.execute(new AbortController().signal);
    expect(result.llmContent).toContain(
      'No MCP resources are currently available.',
    );
  });

  it('formats discovered resources as JSON', async () => {
    const resources: DiscoveredMCPResource[] = [
      {
        serverName: 'server-a',
        uri: 'server://resource/detail',
        discoveredAt: Date.now(),
        name: 'Detail',
        mimeType: 'text/plain',
        description: 'Example',
      },
    ];
    mockConfig.getResourceRegistry = vi.fn().mockReturnValue({
      getAllResources: vi.fn().mockReturnValue(resources),
    });
    tool = new ListResourcesTool(mockConfig as Config);
    invocation = tool.build({});
    const result = await invocation.execute(new AbortController().signal);
    expect(result.llmContent).toContain('server://resource/detail');
    expect(result.returnDisplay).toEqual(result.llmContent);
  });

  it('filters by server name when provided', async () => {
    const resources: DiscoveredMCPResource[] = [
      {
        serverName: 'server-a',
        uri: 'server://resource/a',
        discoveredAt: Date.now(),
        name: 'A',
      },
      {
        serverName: 'server-b',
        uri: 'server://resource/b',
        discoveredAt: Date.now(),
        name: 'B',
      },
    ];
    mockConfig.getResourceRegistry = vi.fn().mockReturnValue({
      getAllResources: vi.fn().mockReturnValue(resources),
    });
    tool = new ListResourcesTool(mockConfig as Config);
    invocation = tool.build({ server_name: 'server-b' });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.llmContent).toContain('server://resource/b');
    expect(result.llmContent).not.toContain('server://resource/a');
  });
});
