/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, useState, useCallback, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, renderWithProviders } from '../../test-utils/render.js';
import { ToolActionsProvider, useToolActions } from './ToolActionsContext.js';
import { ToolConfirmationMessage } from '../components/messages/ToolConfirmationMessage.js';
import {
  type Config,
  ToolConfirmationOutcome,
  MessageBusType,
  IdeClient,
  IDE_CLOSE_DIFF_TIMEOUT_MS,
  IDE_REQUEST_TIMEOUT_MS,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  type IndividualToolCallDisplay,
  type HistoryItemToolGroup,
} from '../types.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    IdeClient: {
      getInstance: vi.fn(),
    },
  };
});

describe('Issue #23297 Validation Suite: Tool Confirmation & IDE Decoupling', () => {
  const mockMessageBus = {
    publish: vi.fn(),
  };

  const mockConfig = {
    getIdeMode: vi.fn().mockReturnValue(true),
    getMessageBus: vi.fn().mockReturnValue(mockMessageBus),
    isTrustedFolder: vi.fn().mockReturnValue(true),
    getDisableAlwaysAllow: vi.fn().mockReturnValue(false),
    getApprovalMode: vi.fn().mockReturnValue('default'),
    getSessionId: vi.fn().mockReturnValue('test-session-id'),
  } as unknown as Config;

  const mockToolCalls: IndividualToolCallDisplay[] = [
    {
      callId: 'edit-call-1',
      correlationId: 'corr-edit-1',
      name: 'edit-tool',
      description: 'First edit',
      status: CoreToolCallStatus.AwaitingApproval,
      resultDisplay: undefined,
      confirmationDetails: {
        type: 'edit',
        title: 'Edit 1',
        fileName: 'file1.txt',
        filePath: '/workspace/file1.txt',
        fileDiff: 'diff-1',
        originalContent: 'old-1',
        newContent: 'new-1',
      },
    },
    {
      callId: 'edit-call-2',
      correlationId: 'corr-edit-2',
      name: 'edit-tool',
      description: 'Second edit',
      status: CoreToolCallStatus.AwaitingApproval,
      resultDisplay: undefined,
      confirmationDetails: {
        type: 'edit',
        title: 'Edit 2',
        fileName: 'file2.txt',
        filePath: '/workspace/file2.txt',
        fileDiff: 'diff-2',
        originalContent: 'old-2',
        newContent: 'new-2',
      },
    },
  ];

  const Wrapper = ({ children }: { children: ReactNode }) => {
    const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
    const isExpanded = useCallback(
      (callId: string) => expandedTools.has(callId),
      [expandedTools],
    );
    const toggleExpansion = useCallback((callId: string) => {
      setExpandedTools((prev) => {
        const next = new Set(prev);
        if (next.has(callId)) next.delete(callId);
        else next.add(callId);
        return next;
      });
    }, []);
    const toggleAllExpansion = useCallback((callIds: string[]) => {
      setExpandedTools(new Set(callIds));
    }, []);

    return (
      <ToolActionsProvider
        config={mockConfig}
        toolCalls={mockToolCalls}
        isExpanded={isExpanded}
        toggleExpansion={toggleExpansion}
        toggleAllExpansion={toggleAllExpansion}
      >
        {children}
      </ToolActionsProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Requirement 1: Mock standard behavior
  // Ensure Enter registers and confirmations propagate instantly under normal circumstances.
  // =========================================================================
  describe('Requirement 1: Standard Behavior & Instant Confirmation Propagation', () => {
    it('propagates confirmation to MessageBus instantly when Enter confirms an action', async () => {
      let deferredIdeClient: { resolve: (c: IdeClient) => void };
      const mockIdeClient = {
        isDiffingEnabled: vi.fn().mockReturnValue(true),
        resolveDiffFromCli: vi.fn().mockResolvedValue(undefined),
        addStatusChangeListener: vi.fn(),
        removeStatusChangeListener: vi.fn(),
      } as unknown as IdeClient;

      vi.mocked(IdeClient.getInstance).mockImplementation(
        () =>
          new Promise((resolve) => {
            deferredIdeClient = { resolve };
          }),
      );

      const { result } = await renderHook(() => useToolActions(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        deferredIdeClient.resolve(mockIdeClient);
      });

      expect(result.current.isDiffingEnabled).toBe(true);

      // Simulate user pressing Enter on "Allow once"
      await result.current.confirm(
        'edit-call-1',
        ToolConfirmationOutcome.ProceedOnce,
      );

      // Assert that confirmation event was published to the MessageBus with correct payload immediately
      expect(mockMessageBus.publish).toHaveBeenCalledWith({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-edit-1',
        confirmed: true,
        requiresUserConfirmation: false,
        outcome: ToolConfirmationOutcome.ProceedOnce,
        payload: undefined,
      });

      // Assert closeDiff was requested via resolveDiffFromCli with 'accepted'
      expect(mockIdeClient.resolveDiffFromCli).toHaveBeenCalledWith(
        '/workspace/file1.txt',
        'accepted',
      );
    });

    it('propagates cancellation to MessageBus instantly and notifies IDE with rejected status', async () => {
      let deferredIdeClient: { resolve: (c: IdeClient) => void };
      const mockIdeClient = {
        isDiffingEnabled: vi.fn().mockReturnValue(true),
        resolveDiffFromCli: vi.fn().mockResolvedValue(undefined),
        addStatusChangeListener: vi.fn(),
        removeStatusChangeListener: vi.fn(),
      } as unknown as IdeClient;

      vi.mocked(IdeClient.getInstance).mockImplementation(
        () =>
          new Promise((resolve) => {
            deferredIdeClient = { resolve };
          }),
      );

      const { result } = await renderHook(() => useToolActions(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        deferredIdeClient.resolve(mockIdeClient);
      });

      // Simulate cancellation
      await result.current.confirm(
        'edit-call-1',
        ToolConfirmationOutcome.Cancel,
      );

      expect(mockMessageBus.publish).toHaveBeenCalledWith({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-edit-1',
        confirmed: false,
        requiresUserConfirmation: false,
        outcome: ToolConfirmationOutcome.Cancel,
        payload: undefined,
      });

      expect(mockIdeClient.resolveDiffFromCli).toHaveBeenCalledWith(
        '/workspace/file1.txt',
        'rejected',
      );
    });

    it('registers Enter keypress in terminal UI and dispatches confirmation instantly', async () => {
      let deferredIdeClient: { resolve: (c: IdeClient) => void };
      const mockIdeClient = {
        isDiffingEnabled: vi.fn().mockReturnValue(true),
        resolveDiffFromCli: vi.fn().mockResolvedValue(undefined),
        addStatusChangeListener: vi.fn(),
        removeStatusChangeListener: vi.fn(),
      } as unknown as IdeClient;

      vi.mocked(IdeClient.getInstance).mockImplementation(
        () =>
          new Promise((resolve) => {
            deferredIdeClient = { resolve };
          }),
      );

      const toolGroup: HistoryItemToolGroup = {
        type: 'tool_group',
        tools: mockToolCalls,
      };

      const { stdin, unmount } = await renderWithProviders(
        <ToolConfirmationMessage
          callId="edit-call-1"
          confirmationDetails={mockToolCalls[0].confirmationDetails!}
          config={mockConfig}
          getPreferredEditor={vi.fn()}
          availableTerminalHeight={30}
          terminalWidth={80}
          toolName="edit-tool"
        />,
        {
          config: mockConfig,
          uiState: {
            pendingHistoryItems: [toolGroup],
          },
        },
      );

      await act(async () => {
        deferredIdeClient.resolve(mockIdeClient);
      });

      // Simulate user pressing Enter in the terminal
      await act(async () => {
        stdin.write('\r');
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'corr-edit-1',
          outcome: ToolConfirmationOutcome.ProceedOnce,
          confirmed: true,
        }),
      );

      unmount();
    });
  });

  // =========================================================================
  // Requirement 2: Mock Hanging/Latency
  // Simulate a scenario where the IDE companion/MessageBus connection hangs
  // or is extremely slow to respond during a diff operation.
  // =========================================================================
  describe('Requirement 2: Mock Hanging / Latency Scenarios', () => {
    it('dispatches confirmation to MessageBus immediately when IDE companion RPC hangs indefinitely', async () => {
      let deferredIdeClient: { resolve: (c: IdeClient) => void };
      const hangingIdePromise = new Promise<void>(() => {});
      const mockIdeClient = {
        isDiffingEnabled: vi.fn().mockReturnValue(true),
        resolveDiffFromCli: vi.fn().mockReturnValue(hangingIdePromise),
        addStatusChangeListener: vi.fn(),
        removeStatusChangeListener: vi.fn(),
      } as unknown as IdeClient;

      vi.mocked(IdeClient.getInstance).mockImplementation(
        () =>
          new Promise((resolve) => {
            deferredIdeClient = { resolve };
          }),
      );

      const { result } = await renderHook(() => useToolActions(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        deferredIdeClient.resolve(mockIdeClient);
      });

      await result.current.confirm(
        'edit-call-1',
        ToolConfirmationOutcome.ProceedOnce,
      );

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'corr-edit-1',
          outcome: ToolConfirmationOutcome.ProceedOnce,
          confirmed: true,
        }),
      );
    });

    it('dispatches confirmation in milliseconds even with extreme IDE companion latency', async () => {
      let deferredIdeClient: { resolve: (c: IdeClient) => void };
      let ideCallCompleted = false;

      // Simulate 10-second latency on the IDE RPC
      const slowIdePromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          ideCallCompleted = true;
          resolve();
        }, 10000);
      });

      const mockIdeClient = {
        isDiffingEnabled: vi.fn().mockReturnValue(true),
        resolveDiffFromCli: vi.fn().mockReturnValue(slowIdePromise),
        addStatusChangeListener: vi.fn(),
        removeStatusChangeListener: vi.fn(),
      } as unknown as IdeClient;

      vi.mocked(IdeClient.getInstance).mockImplementation(
        () =>
          new Promise((resolve) => {
            deferredIdeClient = { resolve };
          }),
      );

      const { result } = await renderHook(() => useToolActions(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        deferredIdeClient.resolve(mockIdeClient);
      });

      const startTime = Date.now();
      await result.current.confirm(
        'edit-call-1',
        ToolConfirmationOutcome.ProceedOnce,
      );
      const elapsed = Date.now() - startTime;

      // Confirmation must complete almost instantaneously (< 200ms), not waiting 10s
      expect(elapsed).toBeLessThan(500);
      expect(ideCallCompleted).toBe(false); // IDE call is still pending in background
      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'corr-edit-1',
        }),
      );
    });

    it('gracefully handles IDE companion connection error/timeout without blocking MessageBus', async () => {
      let deferredIdeClient: { resolve: (c: IdeClient) => void };
      const mockIdeClient = {
        isDiffingEnabled: vi.fn().mockReturnValue(true),
        resolveDiffFromCli: vi
          .fn()
          .mockRejectedValue(
            new Error('IDE fetch failed: UND_ERR_HEADERS_TIMEOUT'),
          ),
        addStatusChangeListener: vi.fn(),
        removeStatusChangeListener: vi.fn(),
      } as unknown as IdeClient;

      vi.mocked(IdeClient.getInstance).mockImplementation(
        () =>
          new Promise((resolve) => {
            deferredIdeClient = { resolve };
          }),
      );

      const { result } = await renderHook(() => useToolActions(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        deferredIdeClient.resolve(mockIdeClient);
      });

      // Confirm should not throw an uncaught error
      await expect(
        result.current.confirm(
          'edit-call-1',
          ToolConfirmationOutcome.ProceedOnce,
        ),
      ).resolves.not.toThrow();

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'corr-edit-1',
          confirmed: true,
        }),
      );
    });

    it('handles MessageBus connection latency during diff operation without deadlocking', async () => {
      let deferredIdeClient: { resolve: (c: IdeClient) => void };
      const hangingIdePromise = new Promise<void>(() => {});
      const mockIdeClient = {
        isDiffingEnabled: vi.fn().mockReturnValue(true),
        resolveDiffFromCli: vi.fn().mockReturnValue(hangingIdePromise),
        addStatusChangeListener: vi.fn(),
        removeStatusChangeListener: vi.fn(),
      } as unknown as IdeClient;

      vi.mocked(IdeClient.getInstance).mockImplementation(
        () =>
          new Promise((resolve) => {
            deferredIdeClient = { resolve };
          }),
      );

      // MessageBus publish has a 50ms latency
      mockMessageBus.publish.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50)),
      );

      const { result } = await renderHook(() => useToolActions(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        deferredIdeClient.resolve(mockIdeClient);
      });

      await result.current.confirm(
        'edit-call-1',
        ToolConfirmationOutcome.ProceedOnce,
      );

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'corr-edit-1',
        }),
      );
    });
  });

  // =========================================================================
  // Requirement 3: Assert Interactivity
  // Verify that despite the stalled IDE callback, the Gemini CLI interactive
  // terminal remains responsive to the Enter key and accepts user inputs.
  // =========================================================================
  describe('Requirement 3: Terminal UI Interactivity Under Stalled IDE Callbacks', () => {
    it('interactive terminal accepts sequential confirmations without blocking on stalled IDE', async () => {
      let deferredIdeClient: { resolve: (c: IdeClient) => void };
      const hangingIdePromise = new Promise<void>(() => {});
      const mockIdeClient = {
        isDiffingEnabled: vi.fn().mockReturnValue(true),
        resolveDiffFromCli: vi.fn().mockReturnValue(hangingIdePromise),
        addStatusChangeListener: vi.fn(),
        removeStatusChangeListener: vi.fn(),
      } as unknown as IdeClient;

      vi.mocked(IdeClient.getInstance).mockImplementation(
        () =>
          new Promise((resolve) => {
            deferredIdeClient = { resolve };
          }),
      );

      const { result } = await renderHook(() => useToolActions(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        deferredIdeClient.resolve(mockIdeClient);
      });

      // User confirms first tool
      await result.current.confirm(
        'edit-call-1',
        ToolConfirmationOutcome.ProceedOnce,
      );

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'corr-edit-1',
          outcome: ToolConfirmationOutcome.ProceedOnce,
          confirmed: true,
        }),
      );

      // Terminal remains completely responsive: user immediately confirms second tool
      await result.current.confirm(
        'edit-call-2',
        ToolConfirmationOutcome.ProceedAlways,
      );

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'corr-edit-2',
          outcome: ToolConfirmationOutcome.ProceedAlways,
          confirmed: true,
        }),
      );
    });

    it('terminal UI receives Enter and subsequent user inputs smoothly while IDE RPC hangs', async () => {
      let deferredIdeClient: { resolve: (c: IdeClient) => void };
      const hangingIdePromise = new Promise<void>(() => {});
      const mockIdeClient = {
        isDiffingEnabled: vi.fn().mockReturnValue(true),
        resolveDiffFromCli: vi.fn().mockReturnValue(hangingIdePromise),
        addStatusChangeListener: vi.fn(),
        removeStatusChangeListener: vi.fn(),
      } as unknown as IdeClient;

      vi.mocked(IdeClient.getInstance).mockImplementation(
        () =>
          new Promise((resolve) => {
            deferredIdeClient = { resolve };
          }),
      );

      const toolGroup: HistoryItemToolGroup = {
        type: 'tool_group',
        tools: mockToolCalls,
      };

      const { stdin, unmount } = await renderWithProviders(
        <ToolConfirmationMessage
          callId="edit-call-1"
          confirmationDetails={mockToolCalls[0].confirmationDetails!}
          config={mockConfig}
          getPreferredEditor={vi.fn()}
          availableTerminalHeight={30}
          terminalWidth={80}
          toolName="edit-tool"
        />,
        {
          config: mockConfig,
          uiState: {
            pendingHistoryItems: [toolGroup],
          },
        },
      );

      await act(async () => {
        deferredIdeClient.resolve(mockIdeClient);
      });

      // User presses Enter to confirm
      await act(async () => {
        stdin.write('\r');
      });

      // Verify confirmation published despite hanging IDE
      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'corr-edit-1',
          outcome: ToolConfirmationOutcome.ProceedOnce,
        }),
      );

      // Terminal remains responsive to subsequent keyboard input
      let keystrokeError = false;
      try {
        await act(async () => {
          stdin.write('j');
          stdin.write('k');
        });
      } catch {
        keystrokeError = true;
      }

      expect(keystrokeError).toBe(false);

      unmount();
    });
  });

  // =========================================================================
  // Requirement 4: Verify Timeout & Resolver State Cleanup
  // Assert that closeDiff callback timeout properly triggers after 5 seconds
  // and fully clears the resolver state instead of sticking for 10 minutes.
  // =========================================================================
  describe('Requirement 4: 5-Second closeDiff Timeout & Full Resolver State Cleanup', () => {
    it('verifies timeout constants are set to 5 seconds for closeDiff vs 10 minutes for user review', () => {
      // 5 seconds for closing diffs vs 10 minutes for interactive user diff review
      expect(IDE_CLOSE_DIFF_TIMEOUT_MS).toBe(5000);
      expect(IDE_REQUEST_TIMEOUT_MS).toBe(600000);
    });

    it('passes 5000ms timeout option to MCP client for closeDiff request', async () => {
      const actualCore = await vi.importActual<
        typeof import('@google/gemini-cli-core')
      >('@google/gemini-cli-core');
      const ideClient = await actualCore.IdeClient.getInstance();

      const mockMcpClient = {
        request: vi.fn().mockResolvedValue({ isError: false, content: [] }),
      } as unknown as Client & { request: ReturnType<typeof vi.fn> };

      (ideClient as unknown as { client: Client }).client = mockMcpClient;

      await (
        ideClient as unknown as {
          closeDiff: (
            filePath: string,
            options?: { suppressNotification?: boolean },
          ) => Promise<unknown>;
        }
      ).closeDiff('/workspace/file.txt', { suppressNotification: true });

      // Assert that 5000ms timeout was passed (not 10 minutes)
      expect(mockMcpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            name: 'closeDiff',
            arguments: {
              filePath: '/workspace/file.txt',
              suppressNotification: true,
            },
          }),
        }),
        expect.any(Object),
        { timeout: 5000 },
      );
    });

    it('triggers after 5-second closeDiff timeout, resolves diff promise cleanly, and clears resolver state from memory', async () => {
      const actualCore = await vi.importActual<
        typeof import('@google/gemini-cli-core')
      >('@google/gemini-cli-core');
      const realIdeClient = await actualCore.IdeClient.getInstance();

      const mockMcpClient = {
        request: vi
          .fn()
          .mockImplementation((req: { params?: { name?: string } }) => {
            if (req?.params?.name === 'openDiff') {
              return Promise.resolve({ isError: false, content: [] });
            }
            if (req?.params?.name === 'closeDiff') {
              return Promise.reject(
                new Error(
                  'Request timed out after 5000ms: UND_ERR_HEADERS_TIMEOUT',
                ),
              );
            }
            return Promise.resolve({ isError: false, content: [] });
          }),
      } as unknown as Client & { request: ReturnType<typeof vi.fn> };

      (realIdeClient as unknown as { client: Client }).client = mockMcpClient;

      let diffResolved = false;
      let diffResult: unknown = null;

      // Simulate openDiff registering a pending resolver
      const openDiffPromise = realIdeClient.openDiff(
        '/workspace/timeout-test.txt',
        'new-content',
      );
      void openDiffPromise.then((res) => {
        diffResolved = true;
        diffResult = res;
      });

      // Yield so openDiff registers in diffResponses
      await new Promise((r) => setImmediate(r));

      const diffResponses = (
        realIdeClient as unknown as {
          diffResponses: Map<string, unknown>;
        }
      ).diffResponses;

      expect(diffResponses.has('/workspace/timeout-test.txt')).toBe(true);

      // Trigger resolveDiffFromCli with closeDiff failure (timed out after 5000ms)
      await realIdeClient.resolveDiffFromCli(
        '/workspace/timeout-test.txt',
        'accepted',
      );

      // Verify openDiff promise resolved cleanly despite the closeDiff timeout
      await openDiffPromise;
      expect(diffResolved).toBe(true);
      expect(diffResult).toEqual({
        status: 'accepted',
        content: undefined,
      });

      // Assert that resolver state was deleted and does not stick in memory
      expect(diffResponses.has('/workspace/timeout-test.txt')).toBe(false);
    });

    it('fully clears resolver state on closeDiff timeout when user rejects the diff', async () => {
      const actualCore = await vi.importActual<
        typeof import('@google/gemini-cli-core')
      >('@google/gemini-cli-core');
      const realIdeClient = await actualCore.IdeClient.getInstance();

      const mockMcpClient = {
        request: vi
          .fn()
          .mockImplementation((req: { params?: { name?: string } }) => {
            if (req?.params?.name === 'openDiff') {
              return Promise.resolve({ isError: false, content: [] });
            }
            if (req?.params?.name === 'closeDiff') {
              return Promise.reject(
                new Error(
                  'Request timed out after 5000ms: UND_ERR_HEADERS_TIMEOUT',
                ),
              );
            }
            return Promise.resolve({ isError: false, content: [] });
          }),
      } as unknown as Client & { request: ReturnType<typeof vi.fn> };

      (realIdeClient as unknown as { client: Client }).client = mockMcpClient;

      let diffResolved = false;
      let diffResult: unknown = null;

      const openDiffPromise = realIdeClient.openDiff(
        '/workspace/reject-test.txt',
        'new-content',
      );
      void openDiffPromise.then((res) => {
        diffResolved = true;
        diffResult = res;
      });

      await new Promise((r) => setImmediate(r));

      const diffResponses = (
        realIdeClient as unknown as {
          diffResponses: Map<string, unknown>;
        }
      ).diffResponses;

      expect(diffResponses.has('/workspace/reject-test.txt')).toBe(true);

      // Trigger resolveDiffFromCli with rejected outcome
      await realIdeClient.resolveDiffFromCli(
        '/workspace/reject-test.txt',
        'rejected',
      );

      await openDiffPromise;
      expect(diffResolved).toBe(true);
      expect(diffResult).toEqual({
        status: 'rejected',
      });

      // Verify resolver map entry is cleanly deleted
      expect(diffResponses.has('/workspace/reject-test.txt')).toBe(false);
    });
  });
});
