/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  buildToolRegistry,
  resolveToolName,
  getToolsByCategory,
  type ToolCategory,
} from '../utils/tool-registry.js';

describe('tool-registry', () => {
  const registry = buildToolRegistry();

  describe('buildToolRegistry', () => {
    it('includes all canonical built-in tools', () => {
      expect(registry.totalTools).toBeGreaterThanOrEqual(26);
    });

    it('every tool has a valid category', () => {
      for (const [name, entry] of registry.tools) {
        expect(entry.category).toBeTruthy();
        expect(entry.name).toBe(name);
      }
    });

    it('byCategory entries match tools map', () => {
      let categoryTotal = 0;
      for (const [, entries] of registry.byCategory) {
        for (const entry of entries) {
          expect(registry.tools.get(entry.name)).toBe(entry);
        }
        categoryTotal += entries.length;
      }
      expect(categoryTotal).toBe(registry.totalTools);
    });

    it('aliasLookup covers every canonical name', () => {
      for (const name of registry.tools.keys()) {
        expect(registry.aliasLookup.get(name)).toBe(name);
      }
    });

    it('aliasLookup covers every legacy alias', () => {
      for (const [, entry] of registry.tools) {
        for (const alias of entry.aliases) {
          expect(registry.aliasLookup.get(alias)).toBe(entry.name);
        }
      }
    });

    it('is deterministic across calls', () => {
      const second = buildToolRegistry();
      expect([...second.tools.keys()]).toEqual([...registry.tools.keys()]);
      expect(second.totalTools).toBe(registry.totalTools);
    });
  });

  describe('resolveToolName', () => {
    it('resolves canonical names to themselves', () => {
      expect(resolveToolName(registry, 'grep_search')).toBe('grep_search');
      expect(resolveToolName(registry, 'run_shell_command')).toBe(
        'run_shell_command',
      );
    });

    it('resolves legacy alias to canonical name', () => {
      expect(resolveToolName(registry, 'search_file_content')).toBe(
        'grep_search',
      );
    });

    it('returns undefined for unknown tool names', () => {
      expect(resolveToolName(registry, 'nonexistent_tool')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(resolveToolName(registry, '')).toBeUndefined();
    });
  });

  describe('getToolsByCategory', () => {
    it('returns file-system tools', () => {
      const tools = getToolsByCategory(registry, 'file-system');
      const names = tools.map((t) => t.name);
      expect(names).toContain('glob');
      expect(names).toContain('grep_search');
      expect(names).toContain('read_file');
      expect(names).toContain('write_file');
      expect(names).toContain('replace');
    });

    it('returns task-tracker tools', () => {
      const tools = getToolsByCategory(registry, 'task-tracker');
      const names = tools.map((t) => t.name);
      expect(names).toContain('tracker_create_task');
      expect(names).toContain('tracker_update_task');
      expect(names).toContain('tracker_get_task');
      expect(names).toContain('tracker_list_tasks');
      expect(names).toContain('tracker_add_dependency');
      expect(names).toContain('tracker_visualize');
      expect(names).toHaveLength(6);
    });

    it('returns agent tools', () => {
      const tools = getToolsByCategory(registry, 'agent');
      const names = tools.map((t) => t.name);
      expect(names).toContain('invoke_agent');
      expect(names).toContain('complete_task');
      expect(names).toContain('update_topic');
    });

    it('returns empty array for unknown category', () => {
      expect(
        getToolsByCategory(registry, 'nonexistent' as ToolCategory),
      ).toEqual([]);
    });

    it('every defined category has at least one tool', () => {
      const expectedCategories: ToolCategory[] = [
        'file-system',
        'shell',
        'web',
        'planning',
        'user-interaction',
        'skills',
        'task-tracker',
        'agent',
        'mcp',
      ];
      for (const cat of expectedCategories) {
        expect(getToolsByCategory(registry, cat).length).toBeGreaterThan(0);
      }
    });
  });
});
