/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import toml from '@iarna/toml';
import { glob } from 'glob';
import { z } from 'zod';
import type { AgentDefinition } from './types.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  MEMORY_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
} from '../tools/tool-names.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';

/**
 * Schema for defining inputs in agent TOML files.
 */
const TomlInputSchema = z.object({
  type: z.enum([
    'string',
    'number',
    'boolean',
    'integer',
    'string[]',
    'number[]',
  ]),
  description: z.string(),
  required: z.boolean().default(true),
});

/**
 * Schema for defining outputs in agent TOML files.
 */
const TomlOutputSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(['string', 'object']).default('string'),
});

/**
 * Schema for agent definition files (TOML format).
 */
const TomlAgentDefSchema = z.object({
  // Basic info
  name: z.string({
    required_error: "The 'name' field is required.",
    invalid_type_error: "The 'name' field must be a string.",
  }),
  displayName: z.string().optional(),
  description: z.string({
    required_error: "The 'description' field is required.",
  }),
  icon: z.string().optional(),
  color: z.string().optional(),

  // Model configuration
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  thinkingBudget: z.number().optional(),

  // Runtime configuration
  maxTimeMinutes: z.number().positive().optional(),
  maxTurns: z.number().positive().optional(),

  // Tools
  tools: z.array(z.string()).optional(),

  // Prompts
  systemPrompt: z.string().optional(),
  query: z.string().optional(),

  // Input/Output definitions
  inputs: z.record(TomlInputSchema).optional(),
  output: TomlOutputSchema.optional(),
});

type TomlAgentDef = z.infer<typeof TomlAgentDefSchema>;

// Allowed tools for user-defined agents (safe, read-only tools)
const ALLOWED_AGENT_TOOLS = new Set([
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  MEMORY_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
]);

/**
 * Loads and parses agent definitions from TOML files in a directory.
 */
export class AgentFileLoader {
  /**
   * Loads all agent definitions from the specified directory.
   *
   * @param directoryPath The absolute path to the agents directory.
   * @param signal An AbortSignal to cancel the loading process.
   * @returns A promise that resolves to an array of AgentDefinition objects.
   */
  async loadAgents(
    directoryPath: string,
    signal: AbortSignal,
  ): Promise<Array<AgentDefinition<z.ZodString>>> {
    try {
      const files = await glob('**/*.toml', {
        cwd: directoryPath,
        nodir: true,
        dot: false,
        signal,
        follow: false,
      });

      const agentPromises = files.map((file) =>
        this.parseAgentFile(path.join(directoryPath, file)),
      );

      const results = await Promise.allSettled(agentPromises);
      const agents: Array<AgentDefinition<z.ZodString>> = [];

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          agents.push(result.value);
        } else if (result.status === 'rejected') {
          debugLogger.warn(
            '[AgentFileLoader] Failed to load agent:',
            result.reason,
          );
        }
      }

      return agents;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        debugLogger.warn(
          `[AgentFileLoader] Error loading agents from ${directoryPath}:`,
          error,
        );
      }
      return [];
    }
  }

  /**
   * Parses a single TOML file and converts it to an AgentDefinition.
   *
   * @param filePath The absolute path to the TOML file.
   * @returns A promise that resolves to an AgentDefinition, or null if invalid.
   */
  private async parseAgentFile(
    filePath: string,
  ): Promise<AgentDefinition<z.ZodString> | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = toml.parse(content);

      // Validate against schema
      const validationResult = TomlAgentDefSchema.safeParse(parsed);

      if (!validationResult.success) {
        debugLogger.warn(
          `[AgentFileLoader] Invalid agent definition in ${filePath}:`,
          validationResult.error.flatten(),
        );
        return null;
      }

      const def = validationResult.data;

      // Convert TOML definition to AgentDefinition format
      return this.tomlToAgentDefinition(def, filePath);
    } catch (error) {
      debugLogger.warn(
        `[AgentFileLoader] Error parsing agent file ${filePath}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Converts a validated TOML agent definition to the internal AgentDefinition format.
   */
  private tomlToAgentDefinition(
    tomlDef: TomlAgentDef,
    filePath: string,
  ): AgentDefinition<z.ZodString> {
    // Validate and filter tools
    const requestedTools = tomlDef.tools || [];
    const validTools = requestedTools.filter((tool) => {
      const isValid = ALLOWED_AGENT_TOOLS.has(tool);
      if (!isValid) {
        debugLogger.warn(
          `[AgentFileLoader] Tool "${tool}" in ${filePath} is not allowed for user agents. Skipping.`,
        );
      }
      return isValid;
    });

    // Default to read-only tools if none specified
    const tools =
      validTools.length > 0
        ? validTools
        : [LS_TOOL_NAME, READ_FILE_TOOL_NAME, GREP_TOOL_NAME, GLOB_TOOL_NAME];

    // Build input config
    const inputConfig = {
      inputs: Object.fromEntries(
        Object.entries(tomlDef.inputs || {}).map(([key, value]) => [
          key,
          {
            description: value.description,
            type: value.type,
            required: value.required,
          },
        ]),
      ),
    };

    // Build output config (simple string output for now)
    const outputConfig = tomlDef.output
      ? {
          outputName: tomlDef.output.name,
          description: tomlDef.output.description,
          schema: z.string(), // TODO: Support object schemas
        }
      : undefined;

    const agentDef: AgentDefinition<z.ZodString> = {
      name: tomlDef.name,
      displayName: tomlDef.displayName || tomlDef.name,
      description: tomlDef.description,
      inputConfig,
      outputConfig,
      modelConfig: {
        model: tomlDef.model || DEFAULT_GEMINI_MODEL,
        temp: tomlDef.temperature ?? 0.1,
        top_p: tomlDef.topP ?? 0.95,
        thinkingBudget: tomlDef.thinkingBudget ?? -1,
      },
      runConfig: {
        max_time_minutes: tomlDef.maxTimeMinutes ?? 5,
        max_turns: tomlDef.maxTurns ?? 15,
      },
      toolConfig: {
        tools,
      },
      promptConfig: {
        systemPrompt: tomlDef.systemPrompt,
        query: tomlDef.query,
      },
    };

    // Store icon and color as metadata (we'll use these in UI)
    if (tomlDef.icon || tomlDef.color) {
      (
        agentDef as AgentDefinition<z.ZodString> & {
          metadata?: Record<string, unknown>;
        }
      ).metadata = {
        icon: tomlDef.icon,
        color: tomlDef.color,
        source: 'user-defined',
        filePath,
      };
    }

    return agentDef;
  }
}
