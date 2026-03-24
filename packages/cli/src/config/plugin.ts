/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import {
  loadSkillsFromDir,
  loadAgentsFromDirectory,
  OPEN_PLUGIN_EVENT_MAP,
  HookType,
  ConfigSource,
  type ExtensionInstallMetadata,
  type GeminiCLIExtension,
  type MCPServerConfig,
  type HookConfig,
} from '@google/gemini-cli-core';
import {
  EXTENSIONS_CONFIG_FILENAME,
  HIDDEN_OPEN_PLUGIN_CONFIG_FILENAME,
  OPEN_PLUGIN_CONFIG_FILENAME,
  OPEN_PLUGIN_MCP_CONFIG_FILENAME,
  HIDDEN_OPEN_PLUGIN_MCP_CONFIG_FILENAME,
  recursivelyHydrateStrings,
} from './extensions/variables.js';
import type { ExtensionConfig } from './extension.js';

/**
 * Open Plugin manifest (plugin.json) v1.0.0
 * Based on https://open-plugins.com/plugin-builders/specification
 */
export interface OpenPluginConfig {
  name: string;
  version?: string;
  description?: string;
  author?: string | { name: string; email?: string; url?: string };
  license?: string;
  // Component fields (parsed but currently ignored during execution per v1 plan)
  skills?: string[] | Record<string, unknown>;
  agents?: string[] | Record<string, unknown>;
  hooks?: string[] | Record<string, unknown>;
  mcpServers?: string | string[] | Record<string, unknown>;
}

export const OPEN_PLUGIN_NAME_REGEX = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

export const openPluginSchema = z.object({
  name: z.string().min(1).max(64).regex(OPEN_PLUGIN_NAME_REGEX),
  version: z.string().optional(),
  description: z.string().optional(),
  author: z
    .union([
      z.string(),
      z.object({
        name: z.string(),
        email: z.string().optional(),
        url: z.string().optional(),
      }),
    ])
    .optional(),
  license: z.string().optional(),
  skills: z.union([z.array(z.string()), z.record(z.any())]).optional(),
  agents: z.union([z.array(z.string()), z.record(z.any())]).optional(),
  hooks: z.union([z.array(z.string()), z.record(z.any())]).optional(),
  mcpServers: z
    .union([z.string(), z.array(z.string()), z.record(z.any())])
    .optional(),
});

export const openPluginMcpSchema = z.object({
  mcpServers: z.record(z.any()),
});

export interface ManifestInfo {
  type: 'gemini' | 'open-plugin';
  path: string;
}

export function findManifest(extensionDir: string): ManifestInfo | undefined {
  const geminiPath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
  if (fs.existsSync(geminiPath)) {
    return { type: 'gemini', path: geminiPath };
  }

  const openPluginPath = path.join(extensionDir, OPEN_PLUGIN_CONFIG_FILENAME);
  if (fs.existsSync(openPluginPath)) {
    return { type: 'open-plugin', path: openPluginPath };
  }

  const hiddenOpenPluginPath = path.join(
    extensionDir,
    HIDDEN_OPEN_PLUGIN_CONFIG_FILENAME,
  );
  if (fs.existsSync(hiddenOpenPluginPath)) {
    return { type: 'open-plugin', path: hiddenOpenPluginPath };
  }

  return undefined;
}

/**
 * Loads an Open Plugin manifest and maps it to ExtensionConfig.
 */
export async function loadOpenPluginConfig(
  manifestPath: string,
  extensionDir: string,
  workspaceDir: string,
): Promise<ExtensionConfig> {
  const content = await fs.promises.readFile(manifestPath, 'utf-8');
  const json = JSON.parse(content) as unknown;
  const result = openPluginSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid plugin.json: ${result.error.message}`);
  }

  const rawConfig = result.data as OpenPluginConfig;

  // Hydrate metadata fields
  const hydratedConfig = recursivelyHydrateStrings(rawConfig, {
    extensionPath: extensionDir,
    PLUGIN_ROOT: extensionDir,
    workspacePath: workspaceDir,
    '/': path.sep,
    pathSeparator: path.sep,
  });

  const mcpServers = await resolveMcpServers(hydratedConfig, extensionDir);

  return {
    name: hydratedConfig.name,
    version: hydratedConfig.version ?? '0.0.0',
    manifestType: 'open-plugin',
    description: hydratedConfig.description,
    author: hydratedConfig.author,
    license: hydratedConfig.license,
    mcpServers,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    hooks: hydratedConfig.hooks as Record<string, unknown> | undefined,
  };
}

/**
 * Resolves MCP server configurations for an Open Plugin by checking the manifest
 * and falling back to default filesystem locations.
 */
async function resolveMcpServers(
  hydratedConfig: OpenPluginConfig,
  extensionDir: string,
): Promise<Record<string, MCPServerConfig> | undefined> {
  let mcpServers: Record<string, MCPServerConfig> | undefined;

  // 1. Explicit mcpServers in plugin.json
  const rawMcpServers = hydratedConfig.mcpServers;
  if (rawMcpServers) {
    if (typeof rawMcpServers === 'string') {
      const mcpPath = path.resolve(extensionDir, rawMcpServers);
      mcpServers = await loadMcpConfigFile(mcpPath);
    } else if (Array.isArray(rawMcpServers)) {
      if (rawMcpServers.length > 0) {
        const first = rawMcpServers[0];
        if (typeof first === 'string') {
          // Support array of paths
          mcpServers = {};
          for (const p of rawMcpServers) {
            const mcpPath = path.resolve(extensionDir, p);
            const servers = await loadMcpConfigFile(mcpPath);
            if (servers) {
              Object.assign(mcpServers, servers);
            }
          }
        }
      }
    } else {
      // It's a Record<string, MCPServerConfig>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      mcpServers = rawMcpServers as Record<string, MCPServerConfig>;
    }
  }

  // 2. Fallback to .mcp.json at plugin root if no servers found yet
  if (!mcpServers) {
    const mcpPath = path.join(extensionDir, OPEN_PLUGIN_MCP_CONFIG_FILENAME);
    const hiddenMcpPath = path.join(
      extensionDir,
      HIDDEN_OPEN_PLUGIN_MCP_CONFIG_FILENAME,
    );

    if (fs.existsSync(mcpPath)) {
      mcpServers = await loadMcpConfigFile(mcpPath);
    } else if (fs.existsSync(hiddenMcpPath)) {
      mcpServers = await loadMcpConfigFile(hiddenMcpPath);
    }
  }

  return mcpServers;
}

async function loadMcpConfigFile(
  mcpPath: string,
): Promise<Record<string, MCPServerConfig> | undefined> {
  try {
    const content = await fs.promises.readFile(mcpPath, 'utf-8');
    const json = JSON.parse(content) as unknown;
    const result = openPluginMcpSchema.safeParse(json);
    if (result.success) {
      return result.data.mcpServers as Record<string, MCPServerConfig>;
    }
  } catch (_e) {
    // Ignore errors loading fallback file
  }
  return undefined;
}

/**
 * Creates a GeminiCLIExtension from an Open Plugin directory.
 */
export async function createOpenPlugin(
  pluginDir: string,
  manifestPath: string,
  isActive: boolean,
  id: string,
  workspaceDir: string,
  installMetadata?: ExtensionInstallMetadata,
): Promise<GeminiCLIExtension> {
  // Use loadOpenPluginConfig to get standard mapping
  const config = await loadOpenPluginConfig(
    manifestPath,
    pluginDir,
    workspaceDir,
  );

  const hydrationContext = {
    extensionPath: pluginDir,
    PLUGIN_ROOT: pluginDir,
    workspacePath: workspaceDir,
    '/': path.sep,
    pathSeparator: path.sep,
  };

  const skills = await resolvePluginSkills(
    pluginDir,
    config.name,
    hydrationContext,
  );

  const agents = await resolvePluginAgents(
    pluginDir,
    config.name,
    hydrationContext,
  );

  const hooks = await resolvePluginHooks(pluginDir, config, hydrationContext);

  return {
    name: config.name,
    version: config.version,
    path: pluginDir,
    isActive,
    id,
    installMetadata,
    manifestType: 'open-plugin',
    description: config.description,
    author: config.author,
    license: config.license,
    // Features partially enabled for Open Plugins
    contextFiles: [],
    mcpServers: config.mcpServers,
    excludeTools: undefined,
    settings: undefined,
    resolvedSettings: undefined,
    skills,
    agents,
    hooks,
    themes: undefined,
  };
}

/**
 * Discovers and namespaces skills for an Open Plugin.
 */
async function resolvePluginSkills(
  pluginDir: string,
  pluginName: string,
  hydrationContext: Record<string, string>,
): Promise<GeminiCLIExtension['skills']> {
  const skillsDir = path.join(pluginDir, 'skills');
  const discoveredSkills = await loadSkillsFromDir(skillsDir);

  if (discoveredSkills.length === 0) {
    return undefined;
  }

  return discoveredSkills.map((skill) => ({
    ...recursivelyHydrateStrings(skill, hydrationContext),
    name: `${pluginName}:${skill.name}`,
    extensionName: pluginName,
  }));
}

/**
 * Discovers and namespaces agents for an Open Plugin.
 */
async function resolvePluginAgents(
  pluginDir: string,
  pluginName: string,
  hydrationContext: Record<string, string>,
): Promise<GeminiCLIExtension['agents']> {
  const agentsDir = path.join(pluginDir, 'agents');
  const agentLoadResult = await loadAgentsFromDirectory(agentsDir, pluginDir);

  if (agentLoadResult.agents.length === 0) {
    return undefined;
  }

  return agentLoadResult.agents.map((agent) => ({
    ...recursivelyHydrateStrings(agent, hydrationContext),
    name: `${pluginName}:${agent.name}`,
    extensionName: pluginName,
  }));
}

/**
 * Discovers hooks for an Open Plugin.
 */
async function resolvePluginHooks(
  pluginDir: string,
  config: ExtensionConfig,
  hydrationContext: Record<string, string>,
): Promise<GeminiCLIExtension['hooks']> {
  let hooksSource: Record<string, unknown> | undefined;

  // 1. Check for hooks in manifest (plugin.json)
  const hooks = config.hooks;
  if (hooks) {
    if (typeof hooks === 'string') {
      const hooksPath = path.resolve(pluginDir, hooks);
      hooksSource = await loadHooksConfigFile(hooksPath);
    } else if (Array.isArray(hooks)) {
      if (hooks.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const firstHook = hooks[0];
        if (typeof firstHook === 'string') {
          const hooksPath = path.resolve(pluginDir, firstHook);
          hooksSource = await loadHooksConfigFile(hooksPath);
        }
      }
    } else if (hooks && typeof hooks === 'object') {
      hooksSource = hooks;
    }
  }

  // 2. Fallback to hooks/hooks.json at plugin root
  if (!hooksSource) {
    const defaultHooksPath = path.join(pluginDir, 'hooks', 'hooks.json');
    if (fs.existsSync(defaultHooksPath)) {
      hooksSource = await loadHooksConfigFile(defaultHooksPath);
    }
  }

  if (!hooksSource) {
    return undefined;
  }

  // 3. Map Open Plugin hooks to Gemini CLI hook definitions
  const result: Record<string, Array<{ hooks: HookConfig[] }>> = {};

  for (const [opEventName, hookDef] of Object.entries(hooksSource)) {
    const geminiEventName = OPEN_PLUGIN_EVENT_MAP[opEventName];
    if (!geminiEventName) {
      continue;
    }

    const configs: HookConfig[] = [];

    // Normalize hook definition to an array of hook configs
    const rawHooks: unknown[] = Array.isArray(hookDef)
      ? (hookDef as unknown[])
      : [hookDef];

    for (const rawHook of rawHooks) {
      if (
        rawHook !== null &&
        typeof rawHook === 'object' &&
        !Array.isArray(rawHook)
      ) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const rawHookRecord = rawHook as Record<string, unknown>;
        // Hydrate strings in hook definition
        const hydratedHookUnknown = recursivelyHydrateStrings(
          rawHookRecord,
          hydrationContext,
        );

        if (
          hydratedHookUnknown !== null &&
          typeof hydratedHookUnknown === 'object' &&
          !Array.isArray(hydratedHookUnknown)
        ) {
          const hh = hydratedHookUnknown;
          const command = hh['command'];
          if (typeof command === 'string') {
            const timeout = hh['timeout'];
            configs.push({
              type: HookType.Command,
              name: config.name,
              command,
              timeout: typeof timeout === 'number' ? timeout : undefined,
              source: ConfigSource.Extensions,
              manifestType: 'open-plugin',
              pluginRoot: pluginDir,
            });
          }
        }
      }
    }

    if (configs.length > 0) {
      if (!result[geminiEventName]) {
        result[geminiEventName] = [];
      }
      result[geminiEventName].push({
        hooks: configs,
      });
    }
  }

  return Object.keys(result).length > 0
    ? (result as GeminiCLIExtension['hooks'])
    : undefined;
}

async function loadHooksConfigFile(
  hooksPath: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const content = await fs.promises.readFile(hooksPath, 'utf-8');
    const json = JSON.parse(content) as unknown;
    if (json !== null && typeof json === 'object' && !Array.isArray(json)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return json as Record<string, unknown>;
    }
  } catch (_e) {
    // Ignore errors
  }
  return undefined;
}
