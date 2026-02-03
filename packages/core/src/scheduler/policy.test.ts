/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  type Mocked,
  beforeEach,
  afterEach,
} from 'vitest';
import { checkPolicy, updatePolicy, getPolicyDenialError } from './policy.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import { ApprovalMode, PolicyDecision } from '../policy/types.js';
import {
  ToolConfirmationOutcome,
  type AnyDeclarativeTool,
  type ToolMcpConfirmationDetails,
  type ToolExecuteConfirmationDetails,
  type AnyToolInvocation,
} from '../tools/tools.js';
import type {
  ValidatingToolCall,
  ToolCallRequestInfo,
  CompletedToolCall,
} from './types.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { CoreToolScheduler } from '../core/coreToolScheduler.js';
import { Scheduler } from './scheduler.js';
import { ROOT_SCHEDULER_ID } from './types.js';
import { ToolErrorType } from '../tools/tool-error.js';
import type { ToolRegistry } from '../tools/tool-registry.js';

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

  describe('getPolicyDenialError', () => {
    it('should return default denial message when no rule provided', () => {
      const mockConfig = {
        getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
      } as unknown as Config;

      const { errorMessage, errorType } = getPolicyDenialError(mockConfig);

      expect(errorMessage).toBe('Tool execution denied by policy.');
      expect(errorType).toBe(ToolErrorType.POLICY_VIOLATION);
    });

    it('should return custom deny message if provided', () => {
      const mockConfig = {
        getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
      } as unknown as Config;
      const rule = {
        decision: PolicyDecision.DENY,
        denyMessage: 'Custom Deny',
      };

      const { errorMessage, errorType } = getPolicyDenialError(
        mockConfig,
        rule,
      );

      expect(errorMessage).toBe('Tool execution denied by policy. Custom Deny');
      expect(errorType).toBe(ToolErrorType.POLICY_VIOLATION);
    });
  });
});

describe('Plan Mode Denial Consistency', () => {
  let mockConfig: Mocked<Config>;
  let mockMessageBus: Mocked<MessageBus>;
  let mockPolicyEngine: Mocked<PolicyEngine>;
  let mockToolRegistry: Mocked<ToolRegistry>;
  let mockTool: AnyDeclarativeTool;
  let mockInvocation: AnyToolInvocation;

  const req: ToolCallRequestInfo = {
    callId: 'call-1',
    name: 'test-tool',
    args: { foo: 'bar' },
    isClientInitiated: false,
    prompt_id: 'prompt-1',
    schedulerId: ROOT_SCHEDULER_ID,
  };

  beforeEach(() => {
    mockTool = {
      name: 'test-tool',
      build: vi.fn(),
    } as unknown as AnyDeclarativeTool;

    mockInvocation = {
      shouldConfirmExecute: vi.fn(),
    } as unknown as AnyToolInvocation;
    vi.mocked(mockTool.build).mockReturnValue(mockInvocation);

    mockPolicyEngine = {
      check: vi.fn().mockResolvedValue({ decision: PolicyDecision.DENY }), // Default to DENY for this test
    } as unknown as Mocked<PolicyEngine>;

    mockToolRegistry = {
      getTool: vi.fn().mockReturnValue(mockTool),
      getAllToolNames: vi.fn().mockReturnValue(['test-tool']),
    } as unknown as Mocked<ToolRegistry>;

    mockMessageBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
    } as unknown as Mocked<MessageBus>;

    mockConfig = {
      getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      getMessageBus: vi.fn().mockReturnValue(mockMessageBus),
      isInteractive: vi.fn().mockReturnValue(true),
      getEnableHooks: vi.fn().mockReturnValue(false),
      getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.PLAN), // Key: Plan Mode
      setApprovalMode: vi.fn(),
      getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
    } as unknown as Mocked<Config>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe.each([
    { enableEventDrivenScheduler: false, name: 'Legacy CoreToolScheduler' },
    { enableEventDrivenScheduler: true, name: 'Event-Driven Scheduler' },
  ])('$name', ({ enableEventDrivenScheduler }) => {
    it('should return the correct Plan Mode denial message when policy denies execution', async () => {
      let resultMessage: string | undefined;
      let resultErrorType: ToolErrorType | undefined;

      const signal = new AbortController().signal;

      if (enableEventDrivenScheduler) {
        const scheduler = new Scheduler({
          config: mockConfig,
          messageBus: mockMessageBus,
          getPreferredEditor: () => undefined,
          schedulerId: ROOT_SCHEDULER_ID,
        });

        const results = await scheduler.schedule(req, signal);
        const result = results[0];

        expect(result.status).toBe('error');
        if (result.status === 'error') {
          resultMessage = result.response.error?.message;
          resultErrorType = result.response.errorType;
        }
      } else {
        let capturedCalls: CompletedToolCall[] = [];
        const scheduler = new CoreToolScheduler({
          config: mockConfig,
          getPreferredEditor: () => undefined,
          onAllToolCallsComplete: async (calls) => {
            capturedCalls = calls;
          },
        });

        await scheduler.schedule(req, signal);

        expect(capturedCalls.length).toBeGreaterThan(0);
        const call = capturedCalls[0];
        if (call.status === 'error') {
          resultMessage = call.response.error?.message;
          resultErrorType = call.response.errorType;
        }
      }

      expect(resultMessage).toBe('Tool execution denied by policy.');
      expect(resultErrorType).toBe(ToolErrorType.POLICY_VIOLATION);
    });
  });
});
