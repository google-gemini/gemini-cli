/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookPlanner } from './hookPlanner.js';
import type { HookRegistry, HookRegistryEntry } from './hookRegistry.js';
import type { Logger } from '@opentelemetry/api-logs';
import { HookEventName, HookType } from '../config/config.js';
import { ConfigSource } from './hookRegistry.js';

// Mock console methods
const mockConsole = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.stubGlobal('console', mockConsole);

describe('HookPlanner', () => {
  let hookPlanner: HookPlanner;
  let mockLogger: Logger;
  let mockHookRegistry: HookRegistry;

  beforeEach(() => {
    vi.resetAllMocks();

    mockLogger = {} as Logger;
    mockHookRegistry = {
      getHooksForEvent: vi.fn(),
    } as unknown as HookRegistry;

    hookPlanner = new HookPlanner(mockLogger, mockHookRegistry);
  });

  describe('createExecutionPlan', () => {
    it('should return empty plan when no hooks registered', () => {
      vi.mocked(mockHookRegistry.getHooksForEvent).mockReturnValue([]);

      const plan = hookPlanner.createExecutionPlan(HookEventName.BeforeTool);

      expect(plan).toBeNull();
    });

    it('should create plan for hooks without matchers', () => {
      const mockEntries: HookRegistryEntry[] = [
        {
          config: { type: HookType.Command, command: './hook1.sh' },
          source: ConfigSource.Project,
          eventName: HookEventName.BeforeTool,
          enabled: true,
        },
        {
          config: {
            type: HookType.Plugin,
            package: 'test-plugin',
            method: 'beforeTool',
          },
          source: ConfigSource.User,
          eventName: HookEventName.BeforeTool,
          enabled: true,
        },
      ];

      vi.mocked(mockHookRegistry.getHooksForEvent).mockReturnValue(mockEntries);

      const plan = hookPlanner.createExecutionPlan(HookEventName.BeforeTool);

      expect(plan).not.toBeNull();
      expect(plan!.hookConfigs).toHaveLength(2);
      expect(plan!.hookConfigs[0].command).toBe('./hook1.sh');
      expect(plan!.hookConfigs[1].package).toBe('test-plugin');
    });

    it('should filter hooks by tool name matcher', () => {
      const mockEntries: HookRegistryEntry[] = [
        {
          config: { type: HookType.Command, command: './edit_hook.sh' },
          source: ConfigSource.Project,
          eventName: HookEventName.BeforeTool,
          matcher: 'EditTool',
          enabled: true,
        },
        {
          config: { type: HookType.Command, command: './general_hook.sh' },
          source: ConfigSource.Project,
          eventName: HookEventName.BeforeTool,
          enabled: true,
        },
      ];

      vi.mocked(mockHookRegistry.getHooksForEvent).mockReturnValue(mockEntries);

      // Test with EditTool context
      const plan = hookPlanner.createExecutionPlan(HookEventName.BeforeTool, {
        toolName: 'EditTool',
      });

      expect(plan).not.toBeNull();
      expect(plan!.hookConfigs).toHaveLength(2); // Both should match (one specific, one general)
    });

    it('should filter hooks by regex matcher', () => {
      const mockEntries: HookRegistryEntry[] = [
        {
          config: { type: HookType.Command, command: './edit_hook.sh' },
          source: ConfigSource.Project,
          eventName: HookEventName.BeforeTool,
          matcher: 'Edit|Write',
          enabled: true,
        },
        {
          config: { type: HookType.Command, command: './read_hook.sh' },
          source: ConfigSource.Project,
          eventName: HookEventName.BeforeTool,
          matcher: 'ReadTool',
          enabled: true,
        },
      ];

      vi.mocked(mockHookRegistry.getHooksForEvent).mockReturnValue(mockEntries);

      // Test with EditTool - should match first hook
      const editPlan = hookPlanner.createExecutionPlan(
        HookEventName.BeforeTool,
        { toolName: 'EditTool' },
      );
      expect(editPlan).not.toBeNull();
      expect(editPlan!.hookConfigs).toHaveLength(1);
      expect(editPlan!.hookConfigs[0].command).toBe('./edit_hook.sh');

      // Test with WriteTool - should match first hook
      const writePlan = hookPlanner.createExecutionPlan(
        HookEventName.BeforeTool,
        { toolName: 'WriteTool' },
      );
      expect(writePlan).not.toBeNull();
      expect(writePlan!.hookConfigs).toHaveLength(1);
      expect(writePlan!.hookConfigs[0].command).toBe('./edit_hook.sh');

      // Test with ReadTool - should match second hook
      const readPlan = hookPlanner.createExecutionPlan(
        HookEventName.BeforeTool,
        { toolName: 'ReadTool' },
      );
      expect(readPlan).not.toBeNull();
      expect(readPlan!.hookConfigs).toHaveLength(1);
      expect(readPlan!.hookConfigs[0].command).toBe('./read_hook.sh');

      // Test with unmatched tool - should match no hooks
      const otherPlan = hookPlanner.createExecutionPlan(
        HookEventName.BeforeTool,
        { toolName: 'OtherTool' },
      );
      expect(otherPlan).toBeNull();
    });

    it('should handle wildcard matcher', () => {
      const mockEntries: HookRegistryEntry[] = [
        {
          config: { type: HookType.Command, command: './wildcard_hook.sh' },
          source: ConfigSource.Project,
          eventName: HookEventName.BeforeTool,
          matcher: '*',
          enabled: true,
        },
      ];

      vi.mocked(mockHookRegistry.getHooksForEvent).mockReturnValue(mockEntries);

      const plan = hookPlanner.createExecutionPlan(HookEventName.BeforeTool, {
        toolName: 'AnyTool',
      });

      expect(plan).not.toBeNull();
      expect(plan!.hookConfigs).toHaveLength(1);
    });

    it('should handle empty string matcher', () => {
      const mockEntries: HookRegistryEntry[] = [
        {
          config: {
            type: HookType.Command,
            command: './empty_matcher_hook.sh',
          },
          source: ConfigSource.Project,
          eventName: HookEventName.BeforeTool,
          matcher: '',
          enabled: true,
        },
      ];

      vi.mocked(mockHookRegistry.getHooksForEvent).mockReturnValue(mockEntries);

      const plan = hookPlanner.createExecutionPlan(HookEventName.BeforeTool, {
        toolName: 'AnyTool',
      });

      expect(plan).not.toBeNull();
      expect(plan!.hookConfigs).toHaveLength(1);
    });

    it('should handle invalid regex matcher gracefully', () => {
      const mockEntries: HookRegistryEntry[] = [
        {
          config: {
            type: HookType.Command,
            command: './invalid_regex_hook.sh',
          },
          source: ConfigSource.Project,
          eventName: HookEventName.BeforeTool,
          matcher: '[invalid-regex',
          enabled: true,
        },
      ];

      vi.mocked(mockHookRegistry.getHooksForEvent).mockReturnValue(mockEntries);

      const plan = hookPlanner.createExecutionPlan(HookEventName.BeforeTool, {
        toolName: '[invalid-regex',
      });

      expect(plan).not.toBeNull();
      expect(plan!.hookConfigs).toHaveLength(1); // Should fall back to exact match
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid regex matcher'),
      );
    });

    it('should deduplicate identical hooks', () => {
      const mockEntries: HookRegistryEntry[] = [
        {
          config: { type: HookType.Command, command: './same_hook.sh' },
          source: ConfigSource.Project,
          eventName: HookEventName.BeforeTool,
          enabled: true,
        },
        {
          config: { type: HookType.Command, command: './same_hook.sh' },
          source: ConfigSource.User,
          eventName: HookEventName.BeforeTool,
          enabled: true,
        },
        {
          config: {
            type: HookType.Plugin,
            package: 'test-plugin',
            method: 'beforeTool',
          },
          source: ConfigSource.Project,
          eventName: HookEventName.BeforeTool,
          enabled: true,
        },
        {
          config: {
            type: HookType.Plugin,
            package: 'test-plugin',
            method: 'beforeTool',
          },
          source: ConfigSource.User,
          eventName: HookEventName.BeforeTool,
          enabled: true,
        },
      ];

      vi.mocked(mockHookRegistry.getHooksForEvent).mockReturnValue(mockEntries);

      const plan = hookPlanner.createExecutionPlan(HookEventName.BeforeTool);

      expect(plan).not.toBeNull();
      expect(plan!.hookConfigs).toHaveLength(2); // Should be deduplicated to 2 unique hooks
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Deduplicated hook'),
      );
    });

    it('should match trigger for session events', () => {
      const mockEntries: HookRegistryEntry[] = [
        {
          config: { type: HookType.Command, command: './startup_hook.sh' },
          source: ConfigSource.Project,
          eventName: HookEventName.SessionStart,
          matcher: 'startup',
          enabled: true,
        },
        {
          config: { type: HookType.Command, command: './resume_hook.sh' },
          source: ConfigSource.Project,
          eventName: HookEventName.SessionStart,
          matcher: 'resume',
          enabled: true,
        },
      ];

      vi.mocked(mockHookRegistry.getHooksForEvent).mockReturnValue(mockEntries);

      // Test startup trigger
      const startupPlan = hookPlanner.createExecutionPlan(
        HookEventName.SessionStart,
        { trigger: 'startup' },
      );
      expect(startupPlan).not.toBeNull();
      expect(startupPlan!.hookConfigs).toHaveLength(1);
      expect(startupPlan!.hookConfigs[0].command).toBe('./startup_hook.sh');

      // Test resume trigger
      const resumePlan = hookPlanner.createExecutionPlan(
        HookEventName.SessionStart,
        { trigger: 'resume' },
      );
      expect(resumePlan).not.toBeNull();
      expect(resumePlan!.hookConfigs).toHaveLength(1);
      expect(resumePlan!.hookConfigs[0].command).toBe('./resume_hook.sh');
    });
  });
});
