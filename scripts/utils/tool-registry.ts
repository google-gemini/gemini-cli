/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ALL_BUILTIN_TOOL_NAMES,
  TOOL_LEGACY_ALIASES,
} from '@google/gemini-cli-core';

export type ToolCategory =
  | 'file-system'
  | 'shell'
  | 'web'
  | 'planning'
  | 'user-interaction'
  | 'skills'
  | 'task-tracker'
  | 'agent'
  | 'mcp';

export interface ToolRegistryEntry {
  name: string;
  category: ToolCategory;
  aliases: readonly string[];
}

export interface ToolRegistry {
  tools: ReadonlyMap<string, ToolRegistryEntry>;
  totalTools: number;
  byCategory: ReadonlyMap<ToolCategory, readonly ToolRegistryEntry[]>;
  aliasLookup: ReadonlyMap<string, string>;
}

const TOOL_CATEGORIES: Record<
  (typeof ALL_BUILTIN_TOOL_NAMES)[number],
  ToolCategory
> = {
  glob: 'file-system',
  grep_search: 'file-system',
  list_directory: 'file-system',
  read_file: 'file-system',
  read_many_files: 'file-system',
  write_file: 'file-system',
  replace: 'file-system',
  run_shell_command: 'shell',
  google_web_search: 'web',
  web_fetch: 'web',
  enter_plan_mode: 'planning',
  exit_plan_mode: 'planning',
  write_todos: 'planning',
  ask_user: 'user-interaction',
  activate_skill: 'skills',
  get_internal_docs: 'skills',
  tracker_create_task: 'task-tracker',
  tracker_update_task: 'task-tracker',
  tracker_get_task: 'task-tracker',
  tracker_list_tasks: 'task-tracker',
  tracker_add_dependency: 'task-tracker',
  tracker_visualize: 'task-tracker',
  invoke_agent: 'agent',
  complete_task: 'agent',
  update_topic: 'agent',
  read_mcp_resource: 'mcp',
  list_mcp_resources: 'mcp',
};

let registryCache: ToolRegistry | undefined;

export function buildToolRegistry(): ToolRegistry {
  if (registryCache) {
    return registryCache;
  }

  const tools = new Map<string, ToolRegistryEntry>();
  const aliasLookup = new Map<string, string>();
  const categoryGroups = new Map<ToolCategory, ToolRegistryEntry[]>();

  for (const name of ALL_BUILTIN_TOOL_NAMES) {
    const category = TOOL_CATEGORIES[name];
    const aliases: string[] = [];

    for (const [legacyName, canonicalName] of Object.entries(
      TOOL_LEGACY_ALIASES,
    )) {
      if (canonicalName === name) {
        aliases.push(legacyName);
        aliasLookup.set(legacyName, name);
      }
    }

    aliasLookup.set(name, name);

    const entry: ToolRegistryEntry = {
      name,
      category,
      aliases: Object.freeze(aliases),
    };

    tools.set(name, entry);

    const group = categoryGroups.get(category);
    if (group) {
      group.push(entry);
    } else {
      categoryGroups.set(category, [entry]);
    }
  }

  const frozenCategories = new Map<
    ToolCategory,
    readonly ToolRegistryEntry[]
  >();
  for (const [cat, entries] of categoryGroups) {
    frozenCategories.set(cat, Object.freeze(entries));
  }

  registryCache = {
    tools,
    totalTools: tools.size,
    byCategory: frozenCategories,
    aliasLookup,
  };
  return registryCache;
}

export function resolveToolName(
  registry: ToolRegistry,
  name: string,
): string | undefined {
  if (!name) {
    return undefined;
  }
  return registry.aliasLookup.get(name);
}

export function getToolsByCategory(
  registry: ToolRegistry,
  category: ToolCategory,
): readonly ToolRegistryEntry[] {
  return registry.byCategory.get(category) ?? [];
}
