/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { applyAdminAllowlist } from './mcpUtils.js';
import type { MCPServerConfig } from '../../config/config.js';

describe('applyAdminAllowlist', () => {
  it('should return original servers if no allowlist provided', () => {
    const localServers: Record<string, MCPServerConfig> = {
      server1: { command: 'cmd1' },
    };
    expect(applyAdminAllowlist(localServers, undefined)).toEqual({
      mcpServers: localServers,
      blockedServerNames: [],
    });
  });

  it('should return original servers if allowlist is empty', () => {
    const localServers: Record<string, MCPServerConfig> = {
      server1: { command: 'cmd1' },
    };
    expect(applyAdminAllowlist(localServers, {})).toEqual({
      mcpServers: localServers,
      blockedServerNames: [],
    });
  });

  it('should filter servers not in allowlist', () => {
    const localServers: Record<string, MCPServerConfig> = {
      server1: { command: 'cmd1' },
      server2: { command: 'cmd2' },
    };
    const allowlist: Record<string, MCPServerConfig> = {
      server1: { url: 'http://server1' },
    };

    const result = applyAdminAllowlist(localServers, allowlist);
    expect(Object.keys(result.mcpServers)).toEqual(['server1']);
    expect(result.blockedServerNames).toEqual(['server2']);
  });

  it('should override connection details with allowlist values', () => {
    const localServers: Record<string, MCPServerConfig> = {
      server1: {
        command: 'local-cmd',
        args: ['local-arg'],
        env: { LOCAL: 'true' },
        description: 'Local description',
      },
    };
    const allowlist: Record<string, MCPServerConfig> = {
      server1: {
        url: 'http://admin-url',
        type: 'sse',
        trust: true,
      },
    };

    const result = applyAdminAllowlist(localServers, allowlist);
    const server = result.mcpServers['server1'];

    expect(server).toBeDefined();
    expect(server?.url).toBe('http://admin-url');
    expect(server?.type).toBe('sse');
    expect(server?.trust).toBe(true);
    // Should preserve other local fields
    expect(server?.description).toBe('Local description');
    // Should remove local connection fields
    expect(server?.command).toBeUndefined();
    expect(server?.args).toBeUndefined();
    expect(server?.env).toBeUndefined();
  });

  it('should apply tool restrictions from allowlist', () => {
    const localServers: Record<string, MCPServerConfig> = {
      server1: { command: 'cmd1' },
    };
    const allowlist: Record<string, MCPServerConfig> = {
      server1: {
        url: 'http://url',
        includeTools: ['tool1'],
        excludeTools: ['tool2'],
      },
    };

    const result = applyAdminAllowlist(localServers, allowlist);
    expect(result.mcpServers['server1']?.includeTools).toEqual(['tool1']);
    expect(result.mcpServers['server1']?.excludeTools).toEqual(['tool2']);
  });

  it('should not apply empty tool restrictions from allowlist', () => {
    const localServers: Record<string, MCPServerConfig> = {
      server1: {
        command: 'cmd1',
        includeTools: ['local-tool'],
      },
    };
    const allowlist: Record<string, MCPServerConfig> = {
      server1: {
        url: 'http://url',
        includeTools: [],
      },
    };

    const result = applyAdminAllowlist(localServers, allowlist);
    // Should keep local tool restrictions if admin ones are empty/undefined
    expect(result.mcpServers['server1']?.includeTools).toEqual(['local-tool']);
  });
});
