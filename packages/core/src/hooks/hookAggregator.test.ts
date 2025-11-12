/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HookAggregator } from './hookAggregator.js';
import type {
  HookExecutionResult,
  BeforeToolSelectionOutput,
  BeforeModelOutput,
  HookOutput,
} from './types.js';
import { HookType, HookEventName } from './types.js';

// Helper function to create proper HookExecutionResult objects
function createHookExecutionResult(
  output?: HookOutput,
  success = true,
  duration = 100,
  error?: Error,
): HookExecutionResult {
  return {
    success,
    output,
    duration,
    error,
    hookConfig: {
      type: HookType.Command,
      command: 'test-command',
      timeout: 30000,
    },
    eventName: HookEventName.BeforeTool,
  };
}

describe('HookAggregator', () => {
  let aggregator: HookAggregator;

  beforeEach(() => {
    aggregator = new HookAggregator();
  });

  describe('aggregateResults', () => {
    it('should handle empty results', () => {
      const results: HookExecutionResult[] = [];

      const aggregated = aggregator.aggregateResults(
        results,
        HookEventName.BeforeTool,
      );

      expect(aggregated.success).toBe(true);
      expect(aggregated.allOutputs).toHaveLength(0);
      expect(aggregated.errors).toHaveLength(0);
      expect(aggregated.totalDuration).toBe(0);
      expect(aggregated.finalOutput).toBeUndefined();
    });

    it('should aggregate successful results', () => {
      const results: HookExecutionResult[] = [
        createHookExecutionResult(
          { decision: 'allow', reason: 'Hook 1 approved' },
          true,
          100,
        ),
        createHookExecutionResult(
          { decision: 'allow', reason: 'Hook 2 approved' },
          true,
          150,
        ),
      ];

      const aggregated = aggregator.aggregateResults(
        results,
        HookEventName.BeforeTool,
      );

      expect(aggregated.success).toBe(true);
      expect(aggregated.allOutputs).toHaveLength(2);
      expect(aggregated.errors).toHaveLength(0);
      expect(aggregated.totalDuration).toBe(250);
      expect(aggregated.finalOutput?.decision).toBe('allow');
      expect(aggregated.finalOutput?.reason).toBe(
        'Hook 1 approved\nHook 2 approved',
      );
    });

    it('should handle errors in results', () => {
      const results: HookExecutionResult[] = [
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeTool,
          success: false,
          error: new Error('Hook failed'),
          duration: 50,
        },
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeTool,
          success: true,
          output: { decision: 'allow' },
          duration: 100,
        },
      ];

      const aggregated = aggregator.aggregateResults(
        results,
        HookEventName.BeforeTool,
      );

      expect(aggregated.success).toBe(false);
      expect(aggregated.allOutputs).toHaveLength(1);
      expect(aggregated.errors).toHaveLength(1);
      expect(aggregated.errors[0].message).toBe('Hook failed');
      expect(aggregated.totalDuration).toBe(150);
    });

    it('should handle blocking decisions with OR logic', () => {
      const results: HookExecutionResult[] = [
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeTool,
          success: true,
          output: { decision: 'allow', reason: 'Hook 1 allowed' },
          duration: 100,
        },
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeTool,
          success: true,
          output: { decision: 'block', reason: 'Hook 2 blocked' },
          duration: 150,
        },
      ];

      const aggregated = aggregator.aggregateResults(
        results,
        HookEventName.BeforeTool,
      );

      expect(aggregated.success).toBe(true);
      expect(aggregated.finalOutput?.decision).toBe('block');
      expect(aggregated.finalOutput?.reason).toBe(
        'Hook 1 allowed\nHook 2 blocked',
      );
    });

    it('should handle continue=false with precedence', () => {
      const results: HookExecutionResult[] = [
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeTool,
          success: true,
          output: { decision: 'allow', continue: true },
          duration: 100,
        },
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeTool,
          success: true,
          output: {
            decision: 'allow',
            continue: false,
            stopReason: 'Stop requested',
          },
          duration: 150,
        },
      ];

      const aggregated = aggregator.aggregateResults(
        results,
        HookEventName.BeforeTool,
      );

      expect(aggregated.success).toBe(true);
      expect(aggregated.finalOutput?.continue).toBe(false);
      expect(aggregated.finalOutput?.stopReason).toBe('Stop requested');
    });
  });

  describe('BeforeToolSelection merge strategy', () => {
    it('should merge tool configurations with NONE mode precedence', () => {
      const results: HookExecutionResult[] = [
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeToolSelection,
          success: true,
          output: {
            hookSpecificOutput: {
              hookEventName: 'BeforeToolSelection',
              toolConfig: {
                mode: 'ANY',
                allowedFunctionNames: ['tool1', 'tool2'],
              },
            },
          } as BeforeToolSelectionOutput,
          duration: 100,
        },
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeToolSelection,
          success: true,
          output: {
            hookSpecificOutput: {
              hookEventName: 'BeforeToolSelection',
              toolConfig: {
                mode: 'NONE',
                allowedFunctionNames: [],
              },
            },
          } as BeforeToolSelectionOutput,
          duration: 150,
        },
      ];

      const aggregated = aggregator.aggregateResults(
        results,
        HookEventName.BeforeToolSelection,
      );

      expect(aggregated.success).toBe(true);
      const output = aggregated.finalOutput as BeforeToolSelectionOutput;
      const toolConfig = output.hookSpecificOutput?.toolConfig;
      expect(toolConfig?.mode).toBe('NONE');
      expect(toolConfig?.allowedFunctionNames).toEqual([]);
    });

    it('should merge tool configurations with ANY mode', () => {
      const results: HookExecutionResult[] = [
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeToolSelection,
          success: true,
          output: {
            hookSpecificOutput: {
              hookEventName: 'BeforeToolSelection',
              toolConfig: {
                mode: 'AUTO',
                allowedFunctionNames: ['tool1'],
              },
            },
          } as BeforeToolSelectionOutput,
          duration: 100,
        },
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeToolSelection,
          success: true,
          output: {
            hookSpecificOutput: {
              hookEventName: 'BeforeToolSelection',
              toolConfig: {
                mode: 'ANY',
                allowedFunctionNames: ['tool2', 'tool3'],
              },
            },
          } as BeforeToolSelectionOutput,
          duration: 150,
        },
      ];

      const aggregated = aggregator.aggregateResults(
        results,
        HookEventName.BeforeToolSelection,
      );

      expect(aggregated.success).toBe(true);
      const output = aggregated.finalOutput as BeforeToolSelectionOutput;
      const toolConfig = output.hookSpecificOutput?.toolConfig;
      expect(toolConfig?.mode).toBe('ANY');
      expect(toolConfig?.allowedFunctionNames).toEqual([
        'tool1',
        'tool2',
        'tool3',
      ]);
    });

    it('should merge tool configurations with AUTO mode when all are AUTO', () => {
      const results: HookExecutionResult[] = [
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeToolSelection,
          success: true,
          output: {
            hookSpecificOutput: {
              hookEventName: 'BeforeToolSelection',
              toolConfig: {
                mode: 'AUTO',
                allowedFunctionNames: ['tool1'],
              },
            },
          } as BeforeToolSelectionOutput,
          duration: 100,
        },
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeToolSelection,
          success: true,
          output: {
            hookSpecificOutput: {
              hookEventName: 'BeforeToolSelection',
              toolConfig: {
                mode: 'AUTO',
                allowedFunctionNames: ['tool2'],
              },
            },
          } as BeforeToolSelectionOutput,
          duration: 150,
        },
      ];

      const aggregated = aggregator.aggregateResults(
        results,
        HookEventName.BeforeToolSelection,
      );

      expect(aggregated.success).toBe(true);
      const output = aggregated.finalOutput as BeforeToolSelectionOutput;
      const toolConfig = output.hookSpecificOutput?.toolConfig;
      expect(toolConfig?.mode).toBe('AUTO');
      expect(toolConfig?.allowedFunctionNames).toEqual(['tool1', 'tool2']);
    });
  });

  describe('BeforeModel/AfterModel merge strategy', () => {
    it('should use field replacement strategy', () => {
      const results: HookExecutionResult[] = [
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeModel,
          success: true,
          output: {
            decision: 'allow',
            hookSpecificOutput: {
              hookEventName: 'BeforeModel',
              llm_request: { model: 'model1', config: {}, contents: [] },
            },
          },
          duration: 100,
        },
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.BeforeModel,
          success: true,
          output: {
            decision: 'block',
            hookSpecificOutput: {
              hookEventName: 'BeforeModel',
              llm_request: { model: 'model2', config: {}, contents: [] },
            },
          },
          duration: 150,
        },
      ];

      const aggregated = aggregator.aggregateResults(
        results,
        HookEventName.BeforeModel,
      );

      expect(aggregated.success).toBe(true);
      expect(aggregated.finalOutput?.decision).toBe('block'); // Later value wins
      const output = aggregated.finalOutput as BeforeModelOutput;
      const llmRequest = output.hookSpecificOutput?.llm_request;
      expect(llmRequest?.['model']).toBe('model2'); // Later value wins
    });
  });

  describe('extractAdditionalContext', () => {
    it('should extract additional context from hook outputs', () => {
      const results: HookExecutionResult[] = [
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.AfterTool,
          success: true,
          output: {
            hookSpecificOutput: {
              hookEventName: 'AfterTool',
              additionalContext: 'Context from hook 1',
            },
          },
          duration: 100,
        },
        {
          hookConfig: {
            type: HookType.Command,
            command: 'test-command',
            timeout: 30000,
          },
          eventName: HookEventName.AfterTool,
          success: true,
          output: {
            hookSpecificOutput: {
              hookEventName: 'AfterTool',
              additionalContext: 'Context from hook 2',
            },
          },
          duration: 150,
        },
      ];

      const aggregated = aggregator.aggregateResults(
        results,
        HookEventName.AfterTool,
      );

      expect(aggregated.success).toBe(true);
      expect(
        aggregated.finalOutput?.hookSpecificOutput?.['additionalContext'],
      ).toBe('Context from hook 1\nContext from hook 2');
    });
  });
});
