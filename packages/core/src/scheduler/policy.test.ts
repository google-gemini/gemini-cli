/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, type Mocked } from 'vitest';
import { checkPolicy, updatePolicy } from './policy.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import { ApprovalMode, PolicyDecision } from '../policy/types.js';
import {
  ToolConfirmationOutcome,
  type AnyDeclarativeTool,
  type ToolMcpConfirmationDetails,
  type ToolExecuteConfirmationDetails,
} from '../tools/tools.js';
import type { ValidatingToolCall } from './types.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';

describe('policy.ts', () => {
  describe('checkPolicy', () => {
    it('should return the decision from the policy engine', async () => {
      const mockPolicyEngine = {
        check: vi.fn().mockResolvedValue({ decision: PolicyDecision.ALLOW }),
      } as unknown as Mocked<PolicyEngine>;

      const mockConfig = {
        getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
      } as unknown as Mocked<Config>;

      const toolCall = {
        request: { name: 'test-tool', args: {} },
        tool: { name: 'test-tool' },
      } as ValidatingToolCall;

      const result = await checkPolicy(toolCall, mockConfig);
      expect(result.decision).toBe(PolicyDecision.ALLOW);
      expect(mockPolicyEngine.check).toHaveBeenCalledWith(
        { name: 'test-tool', args: {} },
        undefined,
      );
    });

    it('should pass serverName for MCP tools', async () => {
      const mockPolicyEngine = {
        check: vi.fn().mockResolvedValue({ decision: PolicyDecision.ALLOW }),
      } as unknown as Mocked<PolicyEngine>;

      const mockConfig = {
        getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
      } as unknown as Mocked<Config>;

      const mcpTool = Object.create(DiscoveredMCPTool.prototype);
      mcpTool.serverName = 'my-server';

      const toolCall = {
        request: { name: 'mcp-tool', args: {} },
        tool: mcpTool,
      } as ValidatingToolCall;

      await checkPolicy(toolCall, mockConfig);
      expect(mockPolicyEngine.check).toHaveBeenCalledWith(
        { name: 'mcp-tool', args: {} },
        'my-server',
      );
    });

    it('should throw if ASK_USER is returned in non-interactive mode', async () => {
      const mockPolicyEngine = {
        check: vi.fn().mockResolvedValue({ decision: PolicyDecision.ASK_USER }),
      } as unknown as Mocked<PolicyEngine>;

      const mockConfig = {
        getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
        isInteractive: vi.fn().mockReturnValue(false),
      } as unknown as Mocked<Config>;

      const toolCall = {
        request: { name: 'test-tool', args: {} },
        tool: { name: 'test-tool' },
      } as ValidatingToolCall;

      await expect(checkPolicy(toolCall, mockConfig)).rejects.toThrow(
        /not supported in non-interactive mode/,
      );
    });

    it('should return DENY without throwing', async () => {
      const mockPolicyEngine = {
        check: vi.fn().mockResolvedValue({ decision: PolicyDecision.DENY }),
      } as unknown as Mocked<PolicyEngine>;

      const mockConfig = {
        getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
      } as unknown as Mocked<Config>;

      const toolCall = {
        request: { name: 'test-tool', args: {} },
        tool: { name: 'test-tool' },
      } as ValidatingToolCall;

      const result = await checkPolicy(toolCall, mockConfig);
      expect(result.decision).toBe(PolicyDecision.DENY);
    });

    it('should return ASK_USER without throwing in interactive mode', async () => {
      const mockPolicyEngine = {
        check: vi.fn().mockResolvedValue({ decision: PolicyDecision.ASK_USER }),
      } as unknown as Mocked<PolicyEngine>;

      const mockConfig = {
        getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
        isInteractive: vi.fn().mockReturnValue(true),
      } as unknown as Mocked<Config>;

      const toolCall = {
        request: { name: 'test-tool', args: {} },
        tool: { name: 'test-tool' },
      } as ValidatingToolCall;

      const result = await checkPolicy(toolCall, mockConfig);
      expect(result.decision).toBe(PolicyDecision.ASK_USER);
    });
  });

  describe('updatePolicy', () => {
    it('should set AUTO_EDIT mode for auto-edit transition tools', async () => {
      const mockConfig = {
        setApprovalMode: vi.fn(),
      } as unknown as Mocked<Config>;
      const mockMessageBus = {
        publish: vi.fn(),
      } as unknown as Mocked<MessageBus>;

      const tool = { name: 'replace' } as AnyDeclarativeTool; // 'replace' is in EDIT_TOOL_NAMES

      await updatePolicy(
        tool,
        ToolConfirmationOutcome.ProceedAlways,
        undefined,
        { config: mockConfig, messageBus: mockMessageBus },
      );

      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.AUTO_EDIT,
      );
      expect(mockMessageBus.publish).not.toHaveBeenCalled();
    });

    it('should handle standard policy updates (persist=false)', async () => {
      const mockConfig = {
        setApprovalMode: vi.fn(),
      } as unknown as Mocked<Config>;
      const mockMessageBus = {
        publish: vi.fn(),
      } as unknown as Mocked<MessageBus>;
      const tool = { name: 'test-tool' } as AnyDeclarativeTool;

      await updatePolicy(
        tool,
        ToolConfirmationOutcome.ProceedAlways,
        undefined,
        { config: mockConfig, messageBus: mockMessageBus },
      );

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'test-tool',
          persist: false,
        }),
      );
    });

    it('should handle standard policy updates with persistence', async () => {
      const mockConfig = {
        setApprovalMode: vi.fn(),
      } as unknown as Mocked<Config>;
      const mockMessageBus = {
        publish: vi.fn(),
      } as unknown as Mocked<MessageBus>;
      const tool = { name: 'test-tool' } as AnyDeclarativeTool;

      await updatePolicy(
        tool,
        ToolConfirmationOutcome.ProceedAlwaysAndSave,
        undefined,
        { config: mockConfig, messageBus: mockMessageBus },
      );

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'test-tool',
          persist: true,
        }),
      );
    });

    it('should handle shell command prefixes', async () => {
      const mockConfig = {
        setApprovalMode: vi.fn(),
      } as unknown as Mocked<Config>;
      const mockMessageBus = {
        publish: vi.fn(),
      } as unknown as Mocked<MessageBus>;
      const tool = { name: 'run_shell_command' } as AnyDeclarativeTool;
      const details: ToolExecuteConfirmationDetails = {
        type: 'exec',
        command: 'ls -la',
        rootCommand: 'ls',
        rootCommands: ['ls'],
        title: 'Shell',
        onConfirm: vi.fn(),
      };

      await updatePolicy(tool, ToolConfirmationOutcome.ProceedAlways, details, {
        config: mockConfig,
        messageBus: mockMessageBus,
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'run_shell_command',
          commandPrefix: ['ls'],
        }),
      );
    });

    it('should handle MCP policy updates (server scope)', async () => {
      const mockConfig = {
        setApprovalMode: vi.fn(),
      } as unknown as Mocked<Config>;
      const mockMessageBus = {
        publish: vi.fn(),
      } as unknown as Mocked<MessageBus>;
      const tool = { name: 'mcp-tool' } as AnyDeclarativeTool;
      const details: ToolMcpConfirmationDetails = {
        type: 'mcp',
        serverName: 'my-server',
        toolName: 'mcp-tool',
        toolDisplayName: 'My Tool',
        title: 'MCP',
        onConfirm: vi.fn(),
      };

      await updatePolicy(
        tool,
        ToolConfirmationOutcome.ProceedAlwaysServer,
        details,
        { config: mockConfig, messageBus: mockMessageBus },
      );

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'my-server__*',
          mcpName: 'my-server',
          persist: false,
        }),
      );
    });

    it('should NOT publish update for ProceedOnce', async () => {
      const mockConfig = {
        setApprovalMode: vi.fn(),
      } as unknown as Mocked<Config>;
      const mockMessageBus = {
        publish: vi.fn(),
      } as unknown as Mocked<MessageBus>;
      const tool = { name: 'test-tool' } as AnyDeclarativeTool;

      await updatePolicy(tool, ToolConfirmationOutcome.ProceedOnce, undefined, {
        config: mockConfig,
        messageBus: mockMessageBus,
      });

      expect(mockMessageBus.publish).not.toHaveBeenCalled();
      expect(mockConfig.setApprovalMode).not.toHaveBeenCalled();
    });

    it('should NOT publish update for Cancel', async () => {
      const mockConfig = {
        setApprovalMode: vi.fn(),
      } as unknown as Mocked<Config>;
      const mockMessageBus = {
        publish: vi.fn(),
      } as unknown as Mocked<MessageBus>;
      const tool = { name: 'test-tool' } as AnyDeclarativeTool;

      await updatePolicy(tool, ToolConfirmationOutcome.Cancel, undefined, {
        config: mockConfig,
        messageBus: mockMessageBus,
      });

      expect(mockMessageBus.publish).not.toHaveBeenCalled();
    });

    it('should NOT publish update for ModifyWithEditor', async () => {
      const mockConfig = {
        setApprovalMode: vi.fn(),
      } as unknown as Mocked<Config>;
      const mockMessageBus = {
        publish: vi.fn(),
      } as unknown as Mocked<MessageBus>;
      const tool = { name: 'test-tool' } as AnyDeclarativeTool;

      await updatePolicy(
        tool,
        ToolConfirmationOutcome.ModifyWithEditor,
        undefined,
        { config: mockConfig, messageBus: mockMessageBus },
      );

      expect(mockMessageBus.publish).not.toHaveBeenCalled();
    });

    it('should handle MCP ProceedAlwaysTool (specific tool name)', async () => {
      const mockConfig = {
        setApprovalMode: vi.fn(),
      } as unknown as Mocked<Config>;
      const mockMessageBus = {
        publish: vi.fn(),
      } as unknown as Mocked<MessageBus>;
      const tool = { name: 'mcp-tool' } as AnyDeclarativeTool;
      const details: ToolMcpConfirmationDetails = {
        type: 'mcp',
        serverName: 'my-server',
        toolName: 'mcp-tool',
        toolDisplayName: 'My Tool',
        title: 'MCP',
        onConfirm: vi.fn(),
      };

      await updatePolicy(
        tool,
        ToolConfirmationOutcome.ProceedAlwaysTool,
        details,
        { config: mockConfig, messageBus: mockMessageBus },
      );

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'mcp-tool', // Specific name, not wildcard
          mcpName: 'my-server',
          persist: false,
        }),
      );
    });

    it('should handle MCP ProceedAlways (persist: false)', async () => {
      const mockConfig = {
        setApprovalMode: vi.fn(),
      } as unknown as Mocked<Config>;
      const mockMessageBus = {
        publish: vi.fn(),
      } as unknown as Mocked<MessageBus>;
      const tool = { name: 'mcp-tool' } as AnyDeclarativeTool;
      const details: ToolMcpConfirmationDetails = {
        type: 'mcp',
        serverName: 'my-server',
        toolName: 'mcp-tool',
        toolDisplayName: 'My Tool',
        title: 'MCP',
        onConfirm: vi.fn(),
      };

      await updatePolicy(tool, ToolConfirmationOutcome.ProceedAlways, details, {
        config: mockConfig,
        messageBus: mockMessageBus,
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'mcp-tool',
          mcpName: 'my-server',
          persist: false,
        }),
      );
    });

    it('should handle MCP ProceedAlwaysAndSave (persist: true)', async () => {
      const mockConfig = {
        setApprovalMode: vi.fn(),
      } as unknown as Mocked<Config>;
      const mockMessageBus = {
        publish: vi.fn(),
      } as unknown as Mocked<MessageBus>;
      const tool = { name: 'mcp-tool' } as AnyDeclarativeTool;
      const details: ToolMcpConfirmationDetails = {
        type: 'mcp',
        serverName: 'my-server',
        toolName: 'mcp-tool',
        toolDisplayName: 'My Tool',
        title: 'MCP',
        onConfirm: vi.fn(),
      };

      await updatePolicy(
        tool,
        ToolConfirmationOutcome.ProceedAlwaysAndSave,
        details,
        { config: mockConfig, messageBus: mockMessageBus },
      );

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.UPDATE_POLICY,
          toolName: 'mcp-tool',
          mcpName: 'my-server',
          persist: true,
        }),
      );
    });
  });
});
