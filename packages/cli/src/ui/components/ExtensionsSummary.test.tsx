/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { vi } from 'vitest';
import { ExtensionsSummary } from './ExtensionsSummary.js';
import { type Config } from '@google/gemini-cli-core';

describe('ExtensionsSummary', () => {
  it('renders nothing when there are no extensions or mcp servers', () => {
    const config = {
      getAllExtensions: vi.fn().mockReturnValue([]),
      getMcpServers: vi.fn().mockReturnValue({}),
      getBlockedMcpServers: vi.fn().mockReturnValue([]),
    } as unknown as Config;

    const { lastFrame } = render(<ExtensionsSummary config={config} />);
    expect(lastFrame()).toBe('');
  });

  it('renders active and inactive extensions', () => {
    const extensions = [
      { name: 'ext1', version: '1.0.0', isActive: true },
      { name: 'ext2', version: '2.0.0', isActive: false },
    ];
    const config = {
      getAllExtensions: vi.fn().mockReturnValue(extensions),
      getMcpServers: vi.fn().mockReturnValue({}),
      getBlockedMcpServers: vi.fn().mockReturnValue([]),
    } as unknown as Config;

    const { lastFrame } = render(<ExtensionsSummary config={config} />);
    const output = lastFrame();
    expect(output).toContain('ext1');
    expect(output).toContain('v1.0.0');
    expect(output).toContain('ext2');
    expect(output).toContain('v2.0.0');
    expect(output).toContain('inactive');
  });

  it('renders enabled and disabled mcp servers', () => {
    const config = {
      getAllExtensions: vi.fn().mockReturnValue([]),
      getMcpServers: vi.fn().mockReturnValue({ 'mcp-server-1': {} }),
      getBlockedMcpServers: vi
        .fn()
        .mockReturnValue([{ name: 'mcp-server-2', extensionName: '' }]),
    } as unknown as Config;

    const { lastFrame } = render(<ExtensionsSummary config={config} />);
    const output = lastFrame();
    expect(output).toContain('mcp-server-1');
    expect(output).toContain('mcp-server-2');
    expect(output).toContain('blocked');
  });
});
