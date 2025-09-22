/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Logger } from '@opentelemetry/api-logs';
import type { HookRegistry, HookRegistryEntry } from './hookRegistry.js';
import type { HookExecutionPlan } from './types.js';
import type { HookEventName } from '../config/config.js';

/**
 * Hook planner that selects matching hooks and creates execution plans
 */
export class HookPlanner {
  private readonly hookRegistry: HookRegistry;

  constructor(logger: Logger, hookRegistry: HookRegistry) {
    this.hookRegistry = hookRegistry;
  }

  /**
   * Create execution plan for a hook event
   */
  createExecutionPlan(
    eventName: HookEventName,
    context?: HookEventContext,
  ): HookExecutionPlan | null {
    const hookEntries = this.hookRegistry.getHooksForEvent(eventName);

    if (hookEntries.length === 0) {
      return null;
    }

    // Filter hooks by matcher
    const matchingEntries = hookEntries.filter((entry) =>
      this.matchesContext(entry, context),
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

    console.debug(
      `Created execution plan for ${eventName}: ${hookConfigs.length} hook(s) to execute ${sequential ? 'sequentially' : 'in parallel'}`,
    );

    return plan;
  }

  /**
   * Check if a hook entry matches the given context
   */
  private matchesContext(
    entry: HookRegistryEntry,
    context?: HookEventContext,
  ): boolean {
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
   */
  private matchesToolName(matcher: string, toolName: string): boolean {
    try {
      // Try as regular expression first
      if (
        matcher.includes('|') ||
        matcher.includes('[') ||
        matcher.includes('(')
      ) {
        const regex = new RegExp(matcher);
        return regex.test(toolName);
      }

      // Exact string match
      return matcher === toolName;
    } catch (error) {
      console.warn(`Invalid regex matcher "${matcher}": ${error}`);
      // Fall back to exact match
      return matcher === toolName;
    }
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
        console.debug(`Deduplicated hook: ${key}`);
      }
    }

    return deduplicated;
  }

  /**
   * Generate a unique key for a hook entry
   */
  private getHookKey(entry: HookRegistryEntry): string {
    if (entry.config.type === 'command') {
      return `command:${entry.config.command}`;
    } else {
      return `plugin:${entry.config.package}:${entry.config.method}`;
    }
  }
}

/**
 * Context information for hook event matching
 */
export interface HookEventContext {
  toolName?: string;
  trigger?: string;
}
