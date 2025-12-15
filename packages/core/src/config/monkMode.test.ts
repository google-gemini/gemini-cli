/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import type { ConfigParameters } from './config.js';
import { Config } from './config.js';
import { SHELL_TOOL_NAME } from '../tools/tool-names.js';

// Mock dependencies
vi.mock('../tools/tool-registry', () => {
  const ToolRegistryMock = vi.fn();
  ToolRegistryMock.prototype.registerTool = vi.fn();
  ToolRegistryMock.prototype.discoverAllTools = vi.fn();
  ToolRegistryMock.prototype.sortTools = vi.fn();
  ToolRegistryMock.prototype.getAllTools = vi.fn(() => []);
  ToolRegistryMock.prototype.getTool = vi.fn();
  ToolRegistryMock.prototype.getFunctionDeclarations = vi.fn(() => []);
  ToolRegistryMock.prototype.setMessageBus = vi.fn();
  return { ToolRegistry: ToolRegistryMock };
});

vi.mock('../utils/memoryDiscovery.js', () => ({
  loadServerHierarchicalMemory: vi.fn(),
}));

// Mock individual tools
vi.mock('../tools/ls');
vi.mock('../tools/read-file', () => ({
  ReadFileTool: class {
    static Name = 'read_file';
  },
}));
vi.mock('../tools/grep.js');
vi.mock('../tools/ripGrep.js', () => ({
  canUseRipgrep: vi.fn(),
  RipGrepTool: class MockRipGrepTool {},
}));
vi.mock('../tools/glob');
vi.mock('../tools/edit');
vi.mock('../tools/shell', () => ({
  ShellTool: class {
    static Name = 'run_shell_command';
  },
}));
vi.mock('../tools/write-file');
vi.mock('../tools/web-fetch');
vi.mock('../tools/read-many-files');
vi.mock('../tools/memoryTool', () => ({
  MemoryTool: vi.fn(),
  setGeminiMdFilename: vi.fn(),
  getCurrentGeminiMdFilename: vi.fn(() => 'GEMINI.md'),
  DEFAULT_CONTEXT_FILENAME: 'GEMINI.md',
  GEMINI_DIR: '.gemini',
}));
vi.mock('../tools/write-todos.js', () => ({
  WriteTodosTool: class {
    static Name = 'write_todos';
  },
}));

vi.mock('../core/contentGenerator.js');
vi.mock('../core/client.js');
vi.mock('../telemetry/index.js');
vi.mock('../services/gitService.js');
vi.mock('../agents/registry.js', () => {
  const AgentRegistryMock = vi.fn();
  AgentRegistryMock.prototype.initialize = vi.fn();
  AgentRegistryMock.prototype.getAllDefinitions = vi.fn(() => []);
  AgentRegistryMock.prototype.getDefinition = vi.fn();
  return { AgentRegistry: AgentRegistryMock };
});

vi.mock('../agents/delegate-to-agent-tool.js', () => ({
  DelegateToAgentTool: vi.fn(),
}));

vi.mock('../resources/resource-registry.js', () => ({
  ResourceRegistry: vi.fn(),
}));

// Mock McpClientManager
const startConfiguredMcpServersMock = vi.fn();
vi.mock('../tools/mcp-client-manager.js', () => ({
  McpClientManager: vi.fn().mockImplementation(() => ({
    startConfiguredMcpServers: startConfiguredMcpServersMock,
  })),
}));

// Mock ExtensionLoader
const startExtensionLoaderMock = vi.fn();
vi.mock('../utils/extensionLoader.js', () => ({
  SimpleExtensionLoader: vi.fn().mockImplementation(() => ({
    start: startExtensionLoaderMock,
    getExtensions: vi.fn().mockReturnValue([]),
  })),
}));

describe('Monk Mode Configuration', () => {
  const baseParams: ConfigParameters = {
    cwd: '/tmp',
    targetDir: '/tmp',
    debugMode: false,
    sessionId: 'test-session-id',
    model: 'gemini-pro',
    usageStatisticsEnabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only register SHELL_TOOL_NAME when monkMode is true', async () => {
    const params: ConfigParameters = {
      ...baseParams,
      monkMode: true,
      // Ensure agents are enabled to test that DelegateToAgentTool is blocked
      codebaseInvestigatorSettings: { enabled: true },
      enableAgents: true,
    };
    const config = new Config(params);
    await config.initialize();

    const registerToolMock = (
      (await vi.importMock('../tools/tool-registry')) as {
        ToolRegistry: { prototype: { registerTool: Mock } };
      }
    ).ToolRegistry.prototype.registerTool;

    // DelegateToAgentTool should NOT be registered
    const DelegateToAgentToolMock = (
      (await vi.importMock('../agents/delegate-to-agent-tool.js')) as {
        DelegateToAgentTool: Mock;
      }
    ).DelegateToAgentTool;

    expect(DelegateToAgentToolMock).not.toHaveBeenCalled();

    // Verify which tools were registered
    const calls = registerToolMock.mock.calls;

    // Check for ShellTool (should be present)
    const shellToolRegistered = calls.some(
      (call) => call[0].constructor.Name === SHELL_TOOL_NAME,
    );
    expect(shellToolRegistered).toBe(true);

    // Check for ReadFileTool (should NOT be present)
    const readFileToolRegistered = calls.some(
      (call) => call[0].constructor.Name === 'read_file',
    );
    expect(readFileToolRegistered).toBe(false);

    // Check total number of registered tools
    // In monk mode, only ShellTool should be registered.
    expect(calls.length).toBe(1);
  });

  it('should NOT start MCP servers, extensions, or discover tools in monk mode', async () => {
    const params: ConfigParameters = {
      ...baseParams,
      monkMode: true,
    };
    const config = new Config(params);
    await config.initialize();

    const discoverAllToolsMock = (
      (await vi.importMock('../tools/tool-registry')) as {
        ToolRegistry: { prototype: { discoverAllTools: Mock } };
      }
    ).ToolRegistry.prototype.discoverAllTools;

    expect(startConfiguredMcpServersMock).not.toHaveBeenCalled();
    expect(startExtensionLoaderMock).not.toHaveBeenCalled();
    expect(discoverAllToolsMock).not.toHaveBeenCalled();
  });

  it('should register other tools and start services when monkMode is false', async () => {
    const params: ConfigParameters = {
      ...baseParams,
      monkMode: false,
      codebaseInvestigatorSettings: { enabled: true },
    };
    const config = new Config(params);
    await config.initialize();

    const registerToolMock = (
      (await vi.importMock('../tools/tool-registry')) as {
        ToolRegistry: { prototype: { registerTool: Mock } };
      }
    ).ToolRegistry.prototype.registerTool;

    const discoverAllToolsMock = (
      (await vi.importMock('../tools/tool-registry')) as {
        ToolRegistry: { prototype: { discoverAllTools: Mock } };
      }
    ).ToolRegistry.prototype.discoverAllTools;

    // DelegateToAgentTool SHOULD be registered
    const DelegateToAgentToolMock = (
      (await vi.importMock('../agents/delegate-to-agent-tool.js')) as {
        DelegateToAgentTool: Mock;
      }
    ).DelegateToAgentTool;

    expect(DelegateToAgentToolMock).toHaveBeenCalled();

    const calls = registerToolMock.mock.calls;

    // Check for ShellTool (should be present)
    const shellToolRegistered = calls.some(
      (call) => call[0].constructor.Name === SHELL_TOOL_NAME,
    );
    expect(shellToolRegistered).toBe(true);

    // Check for ReadFileTool (should be present)
    const readFileToolRegistered = calls.some(
      (call) => call[0].constructor.Name === 'read_file',
    );
    expect(readFileToolRegistered).toBe(true);

    // Services should be started
    expect(startConfiguredMcpServersMock).toHaveBeenCalled();
    expect(startExtensionLoaderMock).toHaveBeenCalled();
    expect(discoverAllToolsMock).toHaveBeenCalled();
  });
});
