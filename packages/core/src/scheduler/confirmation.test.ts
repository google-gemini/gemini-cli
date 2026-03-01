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
  beforeEach,
  afterEach,
  type Mocked,
  type Mock,
} from 'vitest';
import { EventEmitter } from 'node:events';
import { resolveConfirmation } from './confirmation.js';
import {
  MessageBusType,
  type ToolConfirmationResponse,
} from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  ToolConfirmationOutcome,
  type AnyToolInvocation,
  type AnyDeclarativeTool,
} from '../tools/tools.js';
import type { SchedulerStateManager } from './state-manager.js';
import type { ToolModificationHandler } from './tool-modifier.js';
import type { ValidatingToolCall, WaitingToolCall } from './types.js';
import { ROOT_SCHEDULER_ID } from './types.js';
import type { Config } from '../config/config.js';
import { type EditorType } from '../utils/editor.js';
import { randomUUID } from 'node:crypto';

// Mock Dependencies
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
}));

vi.mock('../utils/editor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/editor.js')>();
  return {
    ...actual,
    resolveEditorAsync: () => Promise.resolve('vim'),
  };
});

describe('confirmation.ts', () => {
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    vi.stubEnv('SANDBOX', '');
    mockMessageBus = new EventEmitter() as unknown as MessageBus;
    mockMessageBus.publish = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(mockMessageBus, 'on');
    vi.spyOn(mockMessageBus, 'removeListener');
    vi.mocked(randomUUID).mockReturnValue(
      '123e4567-e89b-12d3-a456-426614174000',
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const emitResponse = (response: ToolConfirmationResponse) => {
    mockMessageBus.emit(MessageBusType.TOOL_CONFIRMATION_RESPONSE, response);
  };

  /**
   * Helper to wait for a listener to be attached to the bus.
   * This is more robust than setTimeout for synchronizing with the async iterator.
   */
  const waitForListener = (eventName: string | symbol): Promise<void> =>
    new Promise((resolve) => {
      const handler = (event: string | symbol) => {
        if (event === eventName) {
          mockMessageBus.off('newListener', handler);
          resolve();
        }
      };
      mockMessageBus.on('newListener', handler);
    });

  describe('resolveConfirmation', () => {
    let mockState: Mocked<SchedulerStateManager>;
    let mockModifier: Mocked<ToolModificationHandler>;
    let mockConfig: Mocked<Config>;
    let getPreferredEditor: Mock<() => EditorType | undefined>;
    let signal: AbortSignal;
    let toolCall: ValidatingToolCall;
    let invocationMock: Mocked<AnyToolInvocation>;
    let toolMock: Mocked<AnyDeclarativeTool>;

    beforeEach(() => {
      signal = new AbortController().signal;

      mockState = {
        getToolCall: vi.fn(),
        updateStatus: vi.fn(),
        updateArgs: vi.fn(),
      } as unknown as Mocked<SchedulerStateManager>;
      // Mock accessors via defineProperty
      Object.defineProperty(mockState, 'firstActiveCall', {
        get: vi.fn(),
        configurable: true,
      });

      const mockHookSystem = {
        fireToolNotificationEvent: vi.fn().mockResolvedValue(undefined),
      };
      mockConfig = {
        getEnableHooks: vi.fn().mockReturnValue(true),
        getHookSystem: vi.fn().mockReturnValue(mockHookSystem),
      } as unknown as Mocked<Config>;

      mockModifier = {
        handleModifyWithEditor: vi.fn(),
        applyInlineModify: vi.fn(),
      } as unknown as Mocked<ToolModificationHandler>;

      getPreferredEditor = vi.fn().mockReturnValue('vim');

      invocationMock = {
        shouldConfirmExecute: vi.fn(),
      } as unknown as Mocked<AnyToolInvocation>;

      toolMock = {
        build: vi.fn(),
      } as unknown as Mocked<AnyDeclarativeTool>;

      toolCall = {
        status: 'validating',
        request: {
          callId: 'call-1',
          name: 'tool',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-1',
        },
        invocation: invocationMock,
        tool: toolMock,
      } as ValidatingToolCall;

      // Default: state returns the current call
      mockState.getToolCall.mockReturnValue(toolCall);
      // Default: define firstActiveCall for modifiers
      vi.spyOn(mockState, 'firstActiveCall', 'get').mockReturnValue(
        toolCall as unknown as WaitingToolCall,
      );
    });

    it('should return ProceedOnce immediately if no confirmation needed', async () => {
      invocationMock.shouldConfirmExecute.mockResolvedValue(false);

      const result = await resolveConfirmation(toolCall, signal, {
        config: mockConfig,
        messageBus: mockMessageBus,
        state: mockState,
        modifier: mockModifier,
        getPreferredEditor,
        schedulerId: ROOT_SCHEDULER_ID,
      });

      expect(result.outcome).toBe(ToolConfirmationOutcome.ProceedOnce);
      expect(mockState.updateStatus).not.toHaveBeenCalledWith(
        expect.anything(),
        'awaiting_approval',
        expect.anything(),
      );
    });

    it('should return ProceedOnce after successful user confirmation', async () => {
      const details = {
        type: 'info' as const,
        prompt: 'Confirm?',
        title: 'Title',
        onConfirm: vi.fn(),
      };
      invocationMock.shouldConfirmExecute.mockResolvedValue(details);

      // Wait for listener to attach
      const listenerPromise = waitForListener(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      );
      const promise = resolveConfirmation(toolCall, signal, {
        config: mockConfig,
        messageBus: mockMessageBus,
        state: mockState,
        modifier: mockModifier,
        getPreferredEditor,
        schedulerId: ROOT_SCHEDULER_ID,
      });
      await listenerPromise;

      emitResponse({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: '123e4567-e89b-12d3-a456-426614174000',
        confirmed: true,
      });

      const result = await promise;
      expect(result.outcome).toBe(ToolConfirmationOutcome.ProceedOnce);
      expect(mockState.updateStatus).toHaveBeenCalledWith(
        'call-1',
        'awaiting_approval',
        expect.objectContaining({
          correlationId: '123e4567-e89b-12d3-a456-426614174000',
        }),
      );
    });

    it('should fire hooks if enabled', async () => {
      const details = {
        type: 'info' as const,
        prompt: 'Confirm?',
        title: 'Title',
        onConfirm: vi.fn(),
      };
      invocationMock.shouldConfirmExecute.mockResolvedValue(details);

      const promise = resolveConfirmation(toolCall, signal, {
        config: mockConfig,
        messageBus: mockMessageBus,
        state: mockState,
        modifier: mockModifier,
        getPreferredEditor,
        schedulerId: ROOT_SCHEDULER_ID,
      });

      await waitForListener(MessageBusType.TOOL_CONFIRMATION_RESPONSE);
      emitResponse({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: '123e4567-e89b-12d3-a456-426614174000',
        confirmed: true,
      });
      await promise;

      expect(
        mockConfig.getHookSystem()?.fireToolNotificationEvent,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          type: details.type,
          prompt: details.prompt,
          title: details.title,
        }),
      );
    });

    it('should handle ModifyWithEditor loop', async () => {
      const details = {
        type: 'info' as const,
        prompt: 'Confirm?',
        title: 'Title',
        onConfirm: vi.fn(),
      };
      invocationMock.shouldConfirmExecute.mockResolvedValue(details);

      // Set up modifier mock before starting the flow
      mockModifier.handleModifyWithEditor.mockResolvedValue({
        updatedParams: { foo: 'bar' },
      });
      toolMock.build.mockReturnValue({} as unknown as AnyToolInvocation);

      // Start the confirmation flow
      const listenerPromise1 = waitForListener(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      );
      const promise = resolveConfirmation(toolCall, signal, {
        config: mockConfig,
        messageBus: mockMessageBus,
        state: mockState,
        modifier: mockModifier,
        getPreferredEditor,
        schedulerId: ROOT_SCHEDULER_ID,
      });

      await listenerPromise1;

      // Prepare to detect when the loop re-subscribes after modification
      const listenerPromise2 = waitForListener(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      );

      // First response: User chooses to modify with editor
      emitResponse({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: '123e4567-e89b-12d3-a456-426614174000',
        confirmed: true,
        outcome: ToolConfirmationOutcome.ModifyWithEditor,
      });

      // Wait for the loop to process the modification and re-subscribe
      await listenerPromise2;

      expect(mockState.updateArgs).toHaveBeenCalled();

      // Second response: User approves the modified params
      emitResponse({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: '123e4567-e89b-12d3-a456-426614174000',
        confirmed: true,
        outcome: ToolConfirmationOutcome.ProceedOnce,
      });

      const result = await promise;
      expect(result.outcome).toBe(ToolConfirmationOutcome.ProceedOnce);
      expect(mockModifier.handleModifyWithEditor).toHaveBeenCalled();
    });

    it('should handle inline modification (payload)', async () => {
      const details = {
        type: 'info' as const,
        prompt: 'Confirm?',
        title: 'Title',
        onConfirm: vi.fn(),
      };
      invocationMock.shouldConfirmExecute.mockResolvedValue(details);

      const listenerPromise = waitForListener(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      );
      const promise = resolveConfirmation(toolCall, signal, {
        config: mockConfig,
        messageBus: mockMessageBus,
        state: mockState,
        modifier: mockModifier,
        getPreferredEditor,
        schedulerId: ROOT_SCHEDULER_ID,
      });

      await listenerPromise;

      // Response with payload
      emitResponse({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: '123e4567-e89b-12d3-a456-426614174000',
        confirmed: true,
        outcome: ToolConfirmationOutcome.ProceedOnce, // Ignored if payload present
        payload: { newContent: 'inline' },
      });

      mockModifier.applyInlineModify.mockResolvedValue({
        updatedParams: { inline: 'true' },
      });
      toolMock.build.mockReturnValue({} as unknown as AnyToolInvocation);

      const result = await promise;
      expect(result.outcome).toBe(ToolConfirmationOutcome.ProceedOnce);
      expect(mockModifier.applyInlineModify).toHaveBeenCalled();
      expect(mockState.updateArgs).toHaveBeenCalled();
    });

    it('should resolve immediately if IDE confirmation resolves first', async () => {
      const idePromise = Promise.resolve({
        status: 'accepted' as const,
        content: 'ide-content',
      });

      const details = {
        type: 'info' as const,
        prompt: 'Confirm?',
        title: 'Title',
        onConfirm: vi.fn(),
        ideConfirmation: idePromise,
      };
      invocationMock.shouldConfirmExecute.mockResolvedValue(details);

      // We don't strictly need to wait for the listener because the race might finish instantly
      const promise = resolveConfirmation(toolCall, signal, {
        config: mockConfig,
        messageBus: mockMessageBus,
        state: mockState,
        modifier: mockModifier,
        getPreferredEditor,
        schedulerId: ROOT_SCHEDULER_ID,
      });

      const result = await promise;
      expect(result.outcome).toBe(ToolConfirmationOutcome.ProceedOnce);
    });

    it('should throw if tool call is lost from state during loop', async () => {
      invocationMock.shouldConfirmExecute.mockResolvedValue({
        type: 'info' as const,
        title: 'Title',
        onConfirm: vi.fn(),
        prompt: 'Prompt',
      });
      // Simulate state losing the call (undefined)
      mockState.getToolCall.mockReturnValue(undefined);

      await expect(
        resolveConfirmation(toolCall, signal, {
          config: mockConfig,
          messageBus: mockMessageBus,
          state: mockState,
          modifier: mockModifier,
          getPreferredEditor,
          schedulerId: ROOT_SCHEDULER_ID,
        }),
      ).rejects.toThrow(/lost during confirmation loop/);
    });
  });
});
