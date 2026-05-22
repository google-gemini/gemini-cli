/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpClient, MCPServerStatus } from './mcp-client.js';
import { ToolRegistry } from './tool-registry.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import { Config } from '../config/config.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import * as ClientLib from '@modelcontextprotocol/sdk/client/index.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cleanupTmpDir } from '@google/gemini-cli-test-utils';
import type { PolicyEngine } from '../policy/policy-engine.js';
import { ApprovalMode } from '../policy/types.js';
import type { ConfigParameters } from '../config/config.js';
import type { Storage } from '../config/storage.js';
import type { PromptRegistry } from '../prompts/prompt-registry.js';
import type { ResourceRegistry } from '../resources/resource-registry.js';

vi.mock('@modelcontextprotocol/sdk/client/index.js');
vi.mock('@modelcontextprotocol/sdk/client/stdio.js');

describe('MCP Tool Disconnection Reproduction', () => {
  let testWorkspace: string;
  let workspaceContext: WorkspaceContext;
  let toolRegistry: ToolRegistry;
  let config: Config;
  let messageBus: MessageBus;
  let agentLoopContext: AgentLoopContext;

  beforeEach(() => {
    testWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-repro-test-'),
    );
    workspaceContext = new WorkspaceContext(testWorkspace);
    const mockPolicyEngine = {
      check: vi.fn().mockResolvedValue({ decision: 'allow' }),
    } as unknown as PolicyEngine;
    messageBus = new MessageBus(mockPolicyEngine);
    config = new Config({
      targetDir: testWorkspace,
      storage: {
        getProjectTempDir: () => testWorkspace,
        getPlansDir: () => path.join(testWorkspace, 'plans'),
      } as unknown as Storage,
    } as unknown as ConfigParameters);

    // Mock config methods needed by Scheduler and ToolRegistry
    vi.spyOn(config, 'getExcludeTools').mockReturnValue(new Set());
    vi.spyOn(config, 'getApprovalMode').mockReturnValue(ApprovalMode.YOLO);
    vi.spyOn(config, 'isTopicUpdateNarrationEnabled').mockReturnValue(false);
    vi.spyOn(config, 'getTelemetryLogPromptsEnabled').mockReturnValue(false);
    vi.spyOn(config, 'getTelemetryTracesEnabled').mockReturnValue(false);
    vi.spyOn(config, 'getSessionId').mockReturnValue('test-session');
    vi.spyOn(config, 'getPolicyEngine').mockReturnValue(mockPolicyEngine);

    toolRegistry = new ToolRegistry(config, messageBus, true);
    agentLoopContext = {
      config,
      toolRegistry,
      messageBus,
    } as unknown as AgentLoopContext;
  });

  afterEach(async () => {
    vi.useRealTimers();
    await cleanupTmpDir(testWorkspace);
    vi.restoreAllMocks();
  });

  it('should FAIL: tool should be found even if removed from registry during a turn', async () => {
    // 1. Setup a mock MCP client and register a tool
    const serverName = 'test-server';
    const toolName = 'mcp_test-server_my_tool';

    const mockedClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue(MCPServerStatus.CONNECTED),
      registerCapabilities: vi.fn(),
      setRequestHandler: vi.fn(),
      setNotificationHandler: vi.fn(),
      getServerCapabilities: vi
        .fn()
        .mockReturnValue({ tools: { listChanged: true } }),
      listTools: vi.fn().mockResolvedValue({
        tools: [
          {
            name: 'my_tool',
            description: 'A test tool',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      }),
      listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
      request: vi.fn().mockResolvedValue({}),
      callTool: vi.fn().mockResolvedValue({ content: [] }),
    };
    vi.mocked(ClientLib.Client).mockReturnValue(
      mockedClient as unknown as ClientLib.Client,
    );

    const mcpClient = new McpClient(
      serverName,
      { command: 'test-cmd' },
      workspaceContext,
      config,
      false,
      '0.0.1',
    );

    await mcpClient.connect();
    await mcpClient.discoverInto(config, {
      toolRegistry,
      promptRegistry: {
        registerPrompt: vi.fn(),
        removePromptsByServer: vi.fn(),
      } as unknown as PromptRegistry,
      resourceRegistry: {
        setResourcesForServer: vi.fn(),
        removeResourcesByServer: vi.fn(),
      } as unknown as ResourceRegistry,
    });

    // Verify tool is registered
    expect(toolRegistry.getTool(toolName)).toBeDefined();

    // 2. Simulate the start of an LLM turn.
    // In a real scenario, the LLM would be "thinking" now.
    // We will simulate a background refresh that returns NO tools.

    const toolUpdateCall = mockedClient.setNotificationHandler.mock.calls.find(
      (call) => call[0] === ToolListChangedNotificationSchema,
    );
    const notificationCallback = toolUpdateCall![1];

    // Mock listTools to return empty array for the refresh
    mockedClient.listTools.mockResolvedValue({ tools: [] });

    // Trigger the refresh
    await notificationCallback();

    // 3. Verify tool is STILL in the registry
    expect(toolRegistry.getTool(toolName)).toBeDefined();

    // 4. Simulate the LLM returning a tool call for the tool it thought was available
    const scheduler = new Scheduler({
      context: agentLoopContext,
      getPreferredEditor: () => undefined,
      schedulerId: 'test-scheduler',
    });

    const results = await scheduler.schedule(
      {
        callId: 'call-1',
        name: toolName,
        args: {},
        isClientInitiated: false,
        prompt_id: 'test-prompt',
      },
      new AbortController().signal,
    );

    // 5. Assert that the tool is found (This will FAIL because of the bug)
    if (results[0].status === 'error') {
      expect(results[0].response?.errorType).not.toBe('tool_not_registered');
    }
  });

  it('should FAIL: tool should be found even if server disconnects during a turn', async () => {
    // 1. Setup a mock MCP client and register a tool
    const serverName = 'test-server';
    const toolName = 'mcp_test-server_my_tool';

    const mockedClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue(MCPServerStatus.CONNECTED),
      registerCapabilities: vi.fn(),
      setRequestHandler: vi.fn(),
      setNotificationHandler: vi.fn(),
      getServerCapabilities: vi.fn().mockReturnValue({ tools: {} }),
      listTools: vi.fn().mockResolvedValue({
        tools: [
          {
            name: 'my_tool',
            description: 'A test tool',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      }),
      listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
      request: vi.fn().mockResolvedValue({}),
      callTool: vi.fn().mockResolvedValue({ content: [] }),
    };
    vi.mocked(ClientLib.Client).mockReturnValue(
      mockedClient as unknown as ClientLib.Client,
    );

    const mcpClient = new McpClient(
      serverName,
      { command: 'test-cmd' },
      workspaceContext,
      config,
      false,
      '0.0.1',
    );

    await mcpClient.connect();
    await mcpClient.discoverInto(config, {
      toolRegistry,
      promptRegistry: {
        registerPrompt: vi.fn(),
        removePromptsByServer: vi.fn(),
      } as unknown as PromptRegistry,
      resourceRegistry: {
        setResourcesForServer: vi.fn(),
        removeResourcesByServer: vi.fn(),
      } as unknown as ResourceRegistry,
    });

    // Verify tool is registered
    expect(toolRegistry.getTool(toolName)).toBeDefined();

    // 2. Simulate a background disconnection (e.g. due to a 5-minute timeout)
    await mcpClient.disconnect();

    // 3. Verify tool is STILL in the registry
    expect(toolRegistry.getTool(toolName)).toBeDefined();

    // 4. Simulate the LLM returning a tool call
    const scheduler = new Scheduler({
      context: agentLoopContext,
      getPreferredEditor: () => undefined,
      schedulerId: 'test-scheduler',
    });

    const results = await scheduler.schedule(
      {
        callId: 'call-1',
        name: toolName,
        args: {},
        isClientInitiated: false,
        prompt_id: 'test-prompt',
      },
      new AbortController().signal,
    );

    // 5. Assert that the tool is found (This will FAIL because of the bug)
    if (results[0].status === 'error') {
      expect(results[0].response?.errorType).not.toBe('tool_not_registered');
    }
  });
});
