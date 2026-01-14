/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import type { LocalAgentDefinition } from './types.js';
import { LocalSubagentInvocation } from './local-invocation.js';
import { LocalAgentExecutor } from './local-executor.js';
import type { SubagentActivityEvent, AgentInputs } from './types.js';
import { AgentTerminateMode } from './types.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { ToolErrorType } from '../tools/tool-error.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { type z } from 'zod';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

vi.mock('./local-executor.js');

const MockLocalAgentExecutor = vi.mocked(LocalAgentExecutor);

let mockConfig: Config;

const testDefinition: LocalAgentDefinition<z.ZodUnknown> = {
  kind: 'local',
  name: 'MockAgent',
  description: 'A mock agent.',
  inputConfig: {
    inputs: {
      task: { type: 'string', required: true, description: 'task' },
      priority: { type: 'number', required: false, description: 'prio' },
    },
  },
  modelConfig: {
    model: 'test',
    generateContentConfig: {
      temperature: 0,
      topP: 1,
    },
  },
  runConfig: { maxTimeMinutes: 1 },
  promptConfig: { systemPrompt: 'test' },
};

describe('LocalSubagentInvocation', () => {
  let mockExecutorInstance: Mocked<LocalAgentExecutor<z.ZodUnknown>>;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = makeFakeConfig();
    mockMessageBus = createMockMessageBus();

    mockExecutorInstance = {
      run: vi.fn(),
      definition: testDefinition,
    } as unknown as Mocked<LocalAgentExecutor<z.ZodUnknown>>;

    MockLocalAgentExecutor.create.mockResolvedValue(
      mockExecutorInstance as unknown as LocalAgentExecutor<z.ZodTypeAny>,
    );
  });

  it('should pass the messageBus to the parent constructor', () => {
    const params = { task: 'Analyze data' };
    const invocation = new LocalSubagentInvocation(
      testDefinition,
      mockConfig,
      params,
      mockMessageBus,
    );

    // Access the protected messageBus property by casting to any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((invocation as any).messageBus).toBe(mockMessageBus);
  });

  describe('getDescription', () => {
    it('should format the description with inputs', () => {
      const params = { task: 'Analyze data', priority: 5 };
      const invocation = new LocalSubagentInvocation(
        testDefinition,
        mockConfig,
        params,
        mockMessageBus,
      );
      const description = invocation.getDescription();
      expect(description).toBe(
        "Running subagent 'MockAgent' with inputs: { task: Analyze data, priority: 5 }",
      );
    });

    it('should truncate long input values', () => {
      const longTask = 'A'.repeat(100);
      const params = { task: longTask };
      const invocation = new LocalSubagentInvocation(
        testDefinition,
        mockConfig,
        params,
        mockMessageBus,
      );
      const description = invocation.getDescription();
      // Default INPUT_PREVIEW_MAX_LENGTH is 50
      expect(description).toBe(
        `Running subagent 'MockAgent' with inputs: { task: ${'A'.repeat(50)} }`,
      );
    });

    it('should truncate the overall description if it exceeds the limit', () => {
      // Create a definition and inputs that result in a very long description
      const longNameDef: LocalAgentDefinition = {
        ...testDefinition,
        name: 'VeryLongAgentNameThatTakesUpSpace',
      };
      const params: AgentInputs = {};
      for (let i = 0; i < 20; i++) {
        params[`input${i}`] = `value${i}`;
      }
      const invocation = new LocalSubagentInvocation(
        longNameDef,
        mockConfig,
        params,
        mockMessageBus,
      );
      const description = invocation.getDescription();
      // Default DESCRIPTION_MAX_LENGTH is 200
      expect(description.length).toBe(200);
      expect(
        description.startsWith(
          "Running subagent 'VeryLongAgentNameThatTakesUpSpace'",
        ),
      ).toBe(true);
    });
  });

  describe('execute', () => {
    let signal: AbortSignal;
    let updateOutput: ReturnType<typeof vi.fn>;
    const params = { task: 'Execute task' };
    let invocation: LocalSubagentInvocation;

    beforeEach(() => {
      signal = new AbortController().signal;
      updateOutput = vi.fn();
      invocation = new LocalSubagentInvocation(
        testDefinition,
        mockConfig,
        params,
        mockMessageBus,
      );
    });

    it('should initialize and run the executor successfully', async () => {
      const mockOutput = {
        result: 'Analysis complete.',
        terminate_reason: AgentTerminateMode.GOAL,
      };
      mockExecutorInstance.run.mockResolvedValue(mockOutput);

      const result = await invocation.execute(signal, updateOutput);

      expect(MockLocalAgentExecutor.create).toHaveBeenCalledWith(
        testDefinition,
        mockConfig,
        expect.any(Function),
      );
      expect(updateOutput).toHaveBeenCalledWith('Subagent starting...\n');

      expect(mockExecutorInstance.run).toHaveBeenCalledWith(params, signal);

      expect(result.llmContent).toEqual([
        {
          text: expect.stringContaining(
            "Subagent 'MockAgent' finished.\nTermination Reason: GOAL\nResult:\nAnalysis complete.",
          ),
        },
      ]);
      expect(result.returnDisplay).toContain('Result:\nAnalysis complete.');
      expect(result.returnDisplay).toContain('Termination Reason:\n GOAL');
    });

    it('should stream THOUGHT_CHUNK activities from the executor', async () => {
      mockExecutorInstance.run.mockImplementation(async () => {
        const onActivity = MockLocalAgentExecutor.create.mock.calls[0][2];

        if (onActivity) {
          onActivity({
            isSubagentActivityEvent: true,
            agentName: 'MockAgent',
            type: 'THOUGHT_CHUNK',
            data: { text: 'Analyzing...' },
          } as SubagentActivityEvent);
          onActivity({
            isSubagentActivityEvent: true,
            agentName: 'MockAgent',
            type: 'THOUGHT_CHUNK',
            data: { text: ' Still thinking.' },
          } as SubagentActivityEvent);
        }
        return { result: 'Done', terminate_reason: AgentTerminateMode.GOAL };
      });

      await invocation.execute(signal, updateOutput);

      expect(updateOutput).toHaveBeenCalledWith('Subagent starting...\n');
      expect(updateOutput).toHaveBeenCalledWith('🤖💭 Analyzing...');
      expect(updateOutput).toHaveBeenCalledWith('🤖💭  Still thinking.');
      expect(updateOutput).toHaveBeenCalledTimes(3); // Initial message + 2 thoughts
    });

    it('should NOT stream other activities (e.g., TOOL_CALL_START, ERROR)', async () => {
      mockExecutorInstance.run.mockImplementation(async () => {
        const onActivity = MockLocalAgentExecutor.create.mock.calls[0][2];

        if (onActivity) {
          onActivity({
            isSubagentActivityEvent: true,
            agentName: 'MockAgent',
            type: 'TOOL_CALL_START',
            data: { name: 'ls' },
          } as SubagentActivityEvent);
          onActivity({
            isSubagentActivityEvent: true,
            agentName: 'MockAgent',
            type: 'ERROR',
            data: { error: 'Failed' },
          } as SubagentActivityEvent);
        }
        return { result: 'Done', terminate_reason: AgentTerminateMode.GOAL };
      });

      await invocation.execute(signal, updateOutput);

      // Should only contain the initial "Subagent starting..." message
      expect(updateOutput).toHaveBeenCalledTimes(1);
      expect(updateOutput).toHaveBeenCalledWith('Subagent starting...\n');
    });

    it('should run successfully without an updateOutput callback', async () => {
      mockExecutorInstance.run.mockImplementation(async () => {
        const onActivity = MockLocalAgentExecutor.create.mock.calls[0][2];
        if (onActivity) {
          // Ensure calling activity doesn't crash when updateOutput is undefined
          onActivity({
            isSubagentActivityEvent: true,
            agentName: 'testAgent',
            type: 'THOUGHT_CHUNK',
            data: { text: 'Thinking silently.' },
          } as SubagentActivityEvent);
        }
        return { result: 'Done', terminate_reason: AgentTerminateMode.GOAL };
      });

      // Execute without the optional callback
      const result = await invocation.execute(signal);
      expect(result.error).toBeUndefined();
      expect(result.returnDisplay).toContain('Result:\nDone');
    });

    it('should handle executor run failure', async () => {
      const error = new Error('Model failed during execution.');
      mockExecutorInstance.run.mockRejectedValue(error);

      const result = await invocation.execute(signal, updateOutput);

      expect(result.error).toEqual({
        message: error.message,
        type: ToolErrorType.EXECUTION_FAILED,
      });
      expect(result.returnDisplay).toBe(
        `Subagent Failed: MockAgent\nError: ${error.message}`,
      );
      expect(result.llmContent).toBe(
        `Subagent 'MockAgent' failed. Error: ${error.message}`,
      );
    });

    it('should handle executor creation failure', async () => {
      const creationError = new Error('Failed to initialize tools.');
      MockLocalAgentExecutor.create.mockRejectedValue(creationError);

      const result = await invocation.execute(signal, updateOutput);

      expect(mockExecutorInstance.run).not.toHaveBeenCalled();
      expect(result.error).toEqual({
        message: creationError.message,
        type: ToolErrorType.EXECUTION_FAILED,
      });
      expect(result.returnDisplay).toContain(`Error: ${creationError.message}`);
    });

    /**
     * This test verifies that the AbortSignal is correctly propagated and
     * that a rejection from the executor due to abortion is handled gracefully.
     */
    it('should handle abortion signal during execution', async () => {
      const abortError = new Error('Aborted');
      mockExecutorInstance.run.mockRejectedValue(abortError);

      const controller = new AbortController();
      const executePromise = invocation.execute(
        controller.signal,
        updateOutput,
      );
      controller.abort();
      const result = await executePromise;

      expect(mockExecutorInstance.run).toHaveBeenCalledWith(
        params,
        controller.signal,
      );
      expect(result.error?.message).toBe('Aborted');
      expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    });
  });
});
