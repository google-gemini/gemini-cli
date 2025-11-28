/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HookRegistry, HookRegistryEntry } from './hookRegistry.js';
import type { HookExecutionPlan } from './types.js';
import type { HookEventName } from './types.js';
import { debugLogger } from '../utils/debugLogger.js';
import { Worker } from 'node:worker_threads';

// Inline worker code for regex testing to prevent ReDoS attacks
const workerCode = `
import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('This code must be run as a worker thread');
}

parentPort.on('message', ({ pattern, testString }) => {
  try {
    const regex = new RegExp(pattern);
    const result = regex.test(testString);
    parentPort.postMessage({ success: true, result });
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
`;

/**
 * Safely tests a string against a user-provided regex pattern to prevent
 * ReDoS (Regular Expression Denial of Service) attacks.
 *
 * This function executes the regex test in an isolated worker thread with a hard
 * timeout. If the regex takes too long (catastrophic backtracking), the worker
 * is terminated and the pattern is rejected. This provides robust protection
 * against malicious or poorly-written regex patterns from untrusted hook sources.
 *
 * @param pattern - The regex pattern from user configuration
 * @param testString - The string to test against the pattern
 * @param timeoutMs - Maximum time to allow regex execution (default: 100ms)
 * @returns Promise resolving to true if pattern matches, false otherwise
 */
async function safeRegexTest(
  pattern: string,
  testString: string,
  timeoutMs = 100,
): Promise<boolean> {
  // Quick checks before spinning up a worker
  if (pattern === '*') return true;
  if (pattern === testString) return true;

  return new Promise((resolve) => {
    let worker: Worker;
    let resolved = false;

    try {
      // Create worker from inline code
      // Cast to any because @types/node might be missing 'type' in WorkerOptions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      worker = new Worker(workerCode, { eval: true, type: 'module' } as any);
    } catch (error) {
      // If worker creation fails, fall back to exact match
      debugLogger.warn(
        `Failed to create worker for regex test: ${error}. Falling back to exact match.`,
      );
      resolve(pattern === testString);
      return;
    }

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        worker.terminate();
        debugLogger.warn(
          `Regex pattern '${pattern}' timed out after ${timeoutMs}ms. Falling back to exact match.`,
        );
        resolve(pattern === testString);
      }
    }, timeoutMs);

    worker.on('message', (msg) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        worker.terminate();

        if (msg.success) {
          resolve(msg.result);
        } else {
          debugLogger.warn(
            `Failed to compile regex pattern '${pattern}': ${msg.error}. Falling back to exact match.`,
          );
          resolve(pattern === testString);
        }
      }
    });

    worker.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        worker.terminate();
        debugLogger.warn(
          `Worker error testing regex pattern '${pattern}': ${error}. Falling back to exact match.`,
        );
        resolve(pattern === testString);
      }
    });

    worker.postMessage({ pattern, testString });
  });
}

/**
 * Hook planner that selects matching hooks and creates execution plans
 */
export class HookPlanner {
  private readonly hookRegistry: HookRegistry;

  constructor(hookRegistry: HookRegistry) {
    this.hookRegistry = hookRegistry;
  }

  /**
   * Create execution plan for a hook event
   */
  async createExecutionPlan(
    eventName: HookEventName,
    context?: HookEventContext,
  ): Promise<HookExecutionPlan | null> {
    const hookEntries = this.hookRegistry.getHooksForEvent(eventName);

    if (hookEntries.length === 0) {
      return null;
    }

    // Filter hooks by matcher (evaluate all matchers in parallel with ReDoS protection)
    const matchResults = await Promise.all(
      hookEntries.map((entry) => this.matchesContext(entry, context)),
    );

    const matchingEntries = hookEntries.filter(
      (_, index) => matchResults[index],
    );

    if (matchingEntries.length === 0) {
      return null;
    }

    // Deduplicate identical hooks
    const deduplicatedEntries = this.deduplicateHooks(matchingEntries);

    // Extract hook configs
    const hookConfigs = deduplicatedEntries.map((entry) => entry.config);

    // Determine execution strategy - if ANY hook definition has sequential=true, run all sequentially
    const sequential = deduplicatedEntries.some(
      (entry) => entry.sequential === true,
    );

    const plan: HookExecutionPlan = {
      eventName,
      hookConfigs,
      sequential,
    };

    debugLogger.debug(
      `Created execution plan for ${eventName}: ${hookConfigs.length} hook(s) to execute ${sequential ? 'sequentially' : 'in parallel'}`,
    );

    return plan;
  }

  /**
   * Check if a hook entry matches the given context
   */
  private async matchesContext(
    entry: HookRegistryEntry,
    context?: HookEventContext,
  ): Promise<boolean> {
    if (!entry.matcher || !context) {
      return true; // No matcher means match all
    }

    const matcher = entry.matcher.trim();

    if (matcher === '' || matcher === '*') {
      return true; // Empty string or wildcard matches all
    }

    // For tool events, match against tool name
    if (context.toolName) {
      return this.matchesToolName(matcher, context.toolName);
    }

    // For other events, match against trigger/source
    if (context.trigger) {
      return this.matchesTrigger(matcher, context.trigger);
    }

    return true;
  }

  /**
   * Match tool name against matcher pattern
   * Uses worker thread isolation to prevent ReDoS attacks
   */
  private async matchesToolName(
    matcher: string,
    toolName: string,
  ): Promise<boolean> {
    // Use safe regex test with worker thread protection
    return safeRegexTest(matcher, toolName);
  }

  /**
   * Match trigger/source against matcher pattern
   */
  private matchesTrigger(matcher: string, trigger: string): boolean {
    return matcher === trigger;
  }

  /**
   * Deduplicate identical hook configurations
   */
  private deduplicateHooks(entries: HookRegistryEntry[]): HookRegistryEntry[] {
    const seen = new Set<string>();
    const deduplicated: HookRegistryEntry[] = [];

    for (const entry of entries) {
      const key = this.getHookKey(entry);

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(entry);
      } else {
        debugLogger.debug(`Deduplicated hook: ${key}`);
      }
    }

    return deduplicated;
  }

  /**
   * Generate a unique key for a hook entry
   */
  private getHookKey(entry: HookRegistryEntry): string {
    return `command:${entry.config.command}`;
  }
}

/**
 * Context information for hook event matching
 */
export interface HookEventContext {
  toolName?: string;
  trigger?: string;
}
