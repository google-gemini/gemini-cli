/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  isMcpToolName,
  parseMcpToolName,
  generateValidName,
  formatMcpToolName,
} from './mcp-tool.js';

describe('MCP Plugin Naming', () => {
  describe('isMcpToolName', () => {
    it('should identify standard MCP tool names', () => {
      expect(isMcpToolName('mcp_server_tool')).toBe(true);
    });
  });

  describe('parseMcpToolName', () => {
    it('should parse standard MCP tool names', () => {
      const result = parseMcpToolName('mcp_server_tool');
      expect(result.serverName).toBe('server');
      expect(result.toolName).toBe('tool');
    });

    it('should parse MCP names with colons in the server name', () => {
      // This is the format for Open Plugins: mcp_plugin:server_tool
      const result = parseMcpToolName('mcp_demo-plugin:demo-server_demo_tool');
      expect(result.serverName).toBe('demo-plugin:demo-server');
      expect(result.toolName).toBe('demo_tool');
    });
  });

  describe('generateValidName', () => {
    it('should add mcp_ prefix to standard names', () => {
      expect(generateValidName('server_tool')).toBe('mcp_server_tool');
    });

    it('should include colons if they are in the input', () => {
      expect(generateValidName('demo-plugin:demo-server_demo_tool')).toBe(
        'mcp_demo-plugin:demo-server_demo_tool',
      );
    });
  });

  describe('formatMcpToolName', () => {
    it('should format standard MCP tool names', () => {
      expect(formatMcpToolName('server', 'tool')).toBe('mcp_server_tool');
    });

    it('should format Open Plugin namespaced tool names using underscores for the tool portion', () => {
      expect(formatMcpToolName('plugin:server', 'tool')).toBe(
        'mcp_plugin:server_tool',
      );
    });
  });
});
