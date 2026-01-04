/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionCallingConfigMode } from '@google/genai';
import type {
  HookOutput,
  HookExecutionResult,
  BeforeToolSelectionOutput,
} from './types.js';
import {
  DefaultHookOutput,
  BeforeToolHookOutput,
  BeforeModelHookOutput,
  BeforeToolSelectionHookOutput,
  AfterModelHookOutput,
} from './types.js';
import { HookEventName } from './types.js';

/**
 * Aggregated hook result
 */
export interface AggregatedHookResult {
  success: boolean;
  finalOutput?: DefaultHookOutput;
  allOutputs: HookOutput[];
  errors: Error[];
  totalDuration: number;
}

/**
 * Hook aggregator that merges results from multiple hooks using event-specific strategies
 */
export class HookAggregator {
  /**
   * Aggregate results from multiple hook executions
   */
  aggregateResults(
    results: HookExecutionResult[],
    eventName: HookEventName,
  ): AggregatedHookResult {
    const allOutputs: HookOutput[] = [];
    const errors: Error[] = [];
    let totalDuration = 0;

    // Collect all outputs and errors
    for (const result of results) {
      totalDuration += result.duration;

      if (result.error) {
        errors.push(result.error);
      }

      if (result.output) {
        allOutputs.push(result.output);
      }
    }

    // Merge outputs using event-specific strategy
    const mergedOutput = this.mergeOutputs(allOutputs, eventName);
    const finalOutput = mergedOutput
      ? this.createSpecificHookOutput(mergedOutput, eventName)
      : undefined;

    return {
      success: errors.length === 0,
      finalOutput,
      allOutputs,
      errors,
      totalDuration,
    };
  }

  /**
   * Merge hook outputs using event-specific strategies
   *
   * Note: We always use the merge logic even for single hooks to ensure
   * consistent default behaviors (e.g., default decision='allow' for OR logic)
   */
  private mergeOutputs(
    outputs: HookOutput[],
    eventName: HookEventName,
  ): HookOutput | undefined {
    if (outputs.length === 0) {
      return undefined;
    }

    switch (eventName) {
      case HookEventName.BeforeTool:
      case HookEventName.AfterTool:
      case HookEventName.BeforeAgent:
      case HookEventName.AfterAgent:
      case HookEventName.SessionStart:
        return this.mergeWithOrDecision(outputs);

      case HookEventName.BeforeModel:
      case HookEventName.AfterModel:
        return this.mergeWithFieldReplacement(outputs);

      case HookEventName.BeforeToolSelection:
        return this.mergeToolSelectionOutputs(
          outputs as BeforeToolSelectionOutput[],
        );

      default:
        // For other events, use simple merge
        return this.mergeSimple(outputs);
    }
  }

  /**
   * Merge outputs with OR decision logic and message concatenation
   */
  private mergeWithOrDecision(outputs: HookOutput[]): HookOutput {
    const merged: HookOutput = {
      continue: true,
      suppressOutput: false,
    };

    const messages: string[] = [];
    const reasons: string[] = [];
    const systemMessages: string[] = [];
    const additionalContexts: string[] = [];

    let hasBlockDecision = false;
    let hasContinueFalse = false;

    for (const output of outputs) {
      // Handle continue flag
      if (output.continue === false) {
        hasContinueFalse = true;
        merged.continue = false;
        if (output.stopReason) {
          messages.push(output.stopReason);
        }
      }

      // Handle decision (OR logic for blocking)
      const tempOutput = new DefaultHookOutput(output);
      if (tempOutput.isBlockingDecision()) {
        hasBlockDecision = true;
        merged.decision = output.decision;
      }

      // Collect messages
      if (output.reason) {
        reasons.push(output.reason);
      }

      if (output.systemMessage) {
        systemMessages.push(output.systemMessage);
      }

      // Handle suppress output (any true wins)
      if (output.suppressOutput) {
        merged.suppressOutput = true;
      }

      // Merge hookSpecificOutput
      if (output.hookSpecificOutput) {
        merged.hookSpecificOutput = {
          ...(merged.hookSpecificOutput || {}),
          ...output.hookSpecificOutput,
        };
      }

      // Collect additional context from hook-specific outputs
      this.extractAdditionalContext(output, additionalContexts);
    }

    // Set final decision if no blocking decision was found
    if (!hasBlockDecision && !hasContinueFalse) {
      merged.decision = 'allow';
    }

    // Merge messages
    if (messages.length > 0) {
      merged.stopReason = messages.join('\n');
    }

    if (reasons.length > 0) {
      merged.reason = reasons.join('\n');
    }

    if (systemMessages.length > 0) {
      merged.systemMessage = systemMessages.join('\n');
    }

    // Add merged additional context
    if (additionalContexts.length > 0) {
      merged.hookSpecificOutput = {
        ...(merged.hookSpecificOutput || {}),
        additionalContext: additionalContexts.join('\n'),
      };
    }

    return merged;
  }

  /**
   * Merge outputs with later fields replacing earlier fields
   */
  private mergeWithFieldReplacement(outputs: HookOutput[]): HookOutput {
    let merged: HookOutput = {};

    for (const output of outputs) {
      // Later outputs override earlier ones
      merged = {
        ...merged,
        ...output,
        hookSpecificOutput: {
          ...merged.hookSpecificOutput,
          ...output.hookSpecificOutput,
        },
      };
    }

    return merged;
  }

  /**
   * Merge tool selection outputs with specific logic for tool config
   *
   * Tool Selection Strategy:
   * - The intent is to provide a UNION of tools from all hooks
   * - If any hook specifies NONE mode, no tools are available (most restrictive wins)
   * - If any hook specifies ANY mode (and no NONE), ANY mode is used
   * - Otherwise AUTO mode is used
   * - Function names are collected from all hooks and sorted for deterministic caching
   *
   * This means hooks can only add/enable tools, not filter them out individually.
   * If one hook restricts and another re-enables, the union takes the re-enabled tool.
   */
  private mergeToolSelectionOutputs(
    outputs: BeforeToolSelectionOutput[],
  ): BeforeToolSelectionOutput {
    const merged: BeforeToolSelectionOutput = {};

    const allFunctionNames = new Set<string>();
    let hasNoneMode = false;
    let hasAnyMode = false;

    for (const output of outputs) {
      const toolConfig = output.hookSpecificOutput?.toolConfig;
      if (!toolConfig) {
        continue;
      }

      // Check mode (using simplified HookToolConfig format)
      if (toolConfig.mode === 'NONE') {
        hasNoneMode = true;
      } else if (toolConfig.mode === 'ANY') {
        hasAnyMode = true;
      }

      // Collect function names (union of all hooks)
      if (toolConfig.allowedFunctionNames) {
        for (const name of toolConfig.allowedFunctionNames) {
          allFunctionNames.add(name);
        }
      }
    }

    // Determine final mode and function names
    let finalMode: FunctionCallingConfigMode;
    let finalFunctionNames: string[] = [];

    if (hasNoneMode) {
      // NONE mode wins - most restrictive
      finalMode = FunctionCallingConfigMode.NONE;
      finalFunctionNames = [];
    } else if (hasAnyMode) {
      // ANY mode if present (and no NONE)
      finalMode = FunctionCallingConfigMode.ANY;
      // Sort for deterministic output to ensure consistent caching
      finalFunctionNames = Array.from(allFunctionNames).sort();
    } else {
      // Default to AUTO mode
      finalMode = FunctionCallingConfigMode.AUTO;
      // Sort for deterministic output to ensure consistent caching
      finalFunctionNames = Array.from(allFunctionNames).sort();
    }

    merged.hookSpecificOutput = {
      hookEventName: 'BeforeToolSelection',
      toolConfig: {
        mode: finalMode,
        allowedFunctionNames: finalFunctionNames,
      },
    };

    return merged;
  }

  /**
   * Simple merge for events without special logic
   */
  private mergeSimple(outputs: HookOutput[]): HookOutput {
    let merged: HookOutput = {};

    for (const output of outputs) {
      merged = { ...merged, ...output };
    }

    return merged;
  }

  /**
   * Create the appropriate specific hook output class based on event type
   */
  private createSpecificHookOutput(
    output: HookOutput,
    eventName: HookEventName,
  ): DefaultHookOutput {
    switch (eventName) {
      case HookEventName.BeforeTool:
        return new BeforeToolHookOutput(output);
      case HookEventName.BeforeModel:
        return new BeforeModelHookOutput(output);
      case HookEventName.BeforeToolSelection:
        return new BeforeToolSelectionHookOutput(output);
      case HookEventName.AfterModel:
        return new AfterModelHookOutput(output);
      default:
        return new DefaultHookOutput(output);
    }
  }

  /**
   * Extract additional context from hook-specific outputs
   */
  private extractAdditionalContext(
    output: HookOutput,
    contexts: string[],
  ): void {
    const specific = output.hookSpecificOutput;
    if (!specific) {
      return;
    }

    // Extract additionalContext from various hook types
    if (
      'additionalContext' in specific &&
      typeof specific['additionalContext'] === 'string'
    ) {
      contexts.push(specific['additionalContext']);
    }
  }
}
