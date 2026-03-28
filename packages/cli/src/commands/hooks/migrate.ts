/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogger, getErrorMessage } from '@google/gemini-cli-core';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { exitCli } from '../utils.js';
import stripJsonComments from 'strip-json-comments';
import { z } from 'zod';

const migrateArgsSchema = z.object({
  'from-claude': z.boolean().default(false),
});

/**
 * Mapping from Claude Code event names to Gemini event names
 */
const EVENT_MAPPING: Record<string, string> = {
  PreToolUse: 'BeforeTool',
  PostToolUse: 'AfterTool',
  UserPromptSubmit: 'BeforeAgent',
  Stop: 'AfterAgent',
  SubAgentStop: 'AfterAgent', // Gemini doesn't have sub-agents, map to AfterAgent
  SessionStart: 'SessionStart',
  SessionEnd: 'SessionEnd',
  PreCompact: 'PreCompress',
  Notification: 'Notification',
};

/**
 * Mapping from Claude Code tool names to Gemini tool names
 */
const TOOL_NAME_MAPPING: Record<string, string> = {
  Edit: 'replace',
  Bash: 'run_shell_command',
  Read: 'read_file',
  Write: 'write_file',
  Glob: 'glob',
  Grep: 'grep',
  LS: 'ls',
};

/**
 * Transform a matcher regex to update tool names from Claude to Gemini
 */
function transformMatcher(matcher: string | undefined): string | undefined {
  if (!matcher) return matcher;

  let transformed = matcher;
  for (const [claudeName, geminiName] of Object.entries(TOOL_NAME_MAPPING)) {
    // Replace exact matches and matches within regex alternations
    transformed = transformed.replace(
      new RegExp(`\\b${claudeName}\\b`, 'g'),
      geminiName,
    );
  }

  return transformed;
}

const claudeHookSchema = z.object({
  type: z.string().optional(),
  command: z.string().optional(),
  timeout: z.number().optional(),
});

const claudeHooksSchema = z.record(z.unknown());

const claudeSettingsSchema = z.object({
  hooks: claudeHooksSchema.optional(),
});

/**
 * Migrate a Claude Code hook configuration to Gemini format
 */
function migrateClaudeHook(claudeHook: unknown): unknown {
  const result = claudeHookSchema.safeParse(claudeHook);
  if (!result.success) {
    return claudeHook;
  }

  const hook = result.data;
  const migrated: Record<string, unknown> = {};

  // Map command field
  if (hook.command) {
    // Replace CLAUDE_PROJECT_DIR with GEMINI_PROJECT_DIR in command
    migrated['command'] = hook.command.replace(
      /\$CLAUDE_PROJECT_DIR/g,
      '$GEMINI_PROJECT_DIR',
    );
  }

  // Map type field
  if (hook.type === 'command') {
    migrated['type'] = 'command';
  }

  // Map timeout field (Claude uses seconds, Gemini uses seconds)
  if (typeof hook.timeout === 'number') {
    migrated['timeout'] = hook.timeout;
  }

  return migrated;
}

/**
 * Migrate Claude Code hooks configuration to Gemini format
 */
function migrateClaudeHooks(claudeConfig: unknown): Record<string, unknown> {
  const result = claudeSettingsSchema.safeParse(claudeConfig);
  if (!result.success || !result.data.hooks) {
    return {};
  }

  const hooksSection = result.data.hooks;
  const geminiHooks: Record<string, unknown> = {};

  for (const [eventName, eventConfig] of Object.entries(hooksSection)) {
    // Skip if not an array (matches original behavior)
    if (!Array.isArray(eventConfig)) {
      continue;
    }

    // Map event name
    const geminiEventName = EVENT_MAPPING[eventName] || eventName;

    // Migrate each hook definition
    const migratedDefinitions = eventConfig
      .map((definition) => {
        // Validate definition is an object
        if (
          !definition ||
          typeof definition !== 'object' ||
          Array.isArray(definition)
        ) {
          return null;
        }

        const migratedDef: Record<string, unknown> = {};

        // Transform matcher
        if ('matcher' in definition && typeof definition.matcher === 'string') {
          migratedDef['matcher'] = transformMatcher(definition.matcher);
        }

        // Copy sequential flag
        if (
          'sequential' in definition &&
          typeof definition.sequential === 'boolean'
        ) {
          migratedDef['sequential'] = definition.sequential;
        }

        // Migrate hooks array
        if ('hooks' in definition && Array.isArray(definition.hooks)) {
          migratedDef['hooks'] = definition.hooks.map(migrateClaudeHook);
        }

        return migratedDef;
      })
      .filter((d): d is Record<string, unknown> => d !== null);

    if (migratedDefinitions.length > 0 || eventConfig.length === 0) {
      geminiHooks[geminiEventName] = migratedDefinitions;
    }
  }

  return geminiHooks;
}

/**
 * Handle migration from Claude Code
 */
export async function handleMigrateFromClaude() {
  const workingDir = process.cwd();

  // Look for Claude settings in .claude directory
  const claudeDir = path.join(workingDir, '.claude');
  const claudeSettingsPath = path.join(claudeDir, 'settings.json');
  const claudeLocalSettingsPath = path.join(claudeDir, 'settings.local.json');

  let claudeSettings: Record<string, unknown> | null = null;
  let sourceFile = '';

  // Try to read settings.local.json first, then settings.json
  if (fs.existsSync(claudeLocalSettingsPath)) {
    sourceFile = claudeLocalSettingsPath;
    try {
      const content = fs.readFileSync(claudeLocalSettingsPath, 'utf-8');
      claudeSettings = claudeSettingsSchema.parse(
        JSON.parse(stripJsonComments(content)),
      );
    } catch (error) {
      debugLogger.error(
        `Error reading ${claudeLocalSettingsPath}: ${getErrorMessage(error)}`,
      );
    }
  } else if (fs.existsSync(claudeSettingsPath)) {
    sourceFile = claudeSettingsPath;
    try {
      const content = fs.readFileSync(claudeSettingsPath, 'utf-8');
      claudeSettings = claudeSettingsSchema.parse(
        JSON.parse(stripJsonComments(content)),
      );
    } catch (error) {
      debugLogger.error(
        `Error reading ${claudeSettingsPath}: ${getErrorMessage(error)}`,
      );
    }
  } else {
    debugLogger.error(
      'No Claude Code settings found in .claude directory. Expected settings.json or settings.local.json',
    );
    return;
  }

  if (!claudeSettings) {
    return;
  }

  debugLogger.log(`Found Claude Code settings in: ${sourceFile}`);

  // Migrate hooks
  const migratedHooks = migrateClaudeHooks(claudeSettings);

  // Load current Gemini settings
  const settings = loadSettings(workingDir);

  // Merge with existing hooks
  const existingHooks = (settings.merged?.hooks || {}) as Record<
    string,
    unknown
  >;

  // If no hooks were found at all after migration, just log and return
  if (Object.keys(migratedHooks).length === 0) {
    debugLogger.log('No hooks found in Claude Code settings to migrate.');
    return;
  }

  const mergedHooks: Record<string, unknown> = {
    ...existingHooks,
    ...migratedHooks,
  };

  debugLogger.log(
    `Migrating ${Object.keys(migratedHooks).length} hook event(s)...`,
  );

  const targetFile = '.gemini/settings.json';
  try {
    settings.setValue(SettingScope.Workspace, 'hooks', mergedHooks);

    debugLogger.log(`✓ Hooks successfully migrated to ${targetFile}`);
    debugLogger.log(
      '\nMigration complete! Please review the migrated hooks in .gemini/settings.json',
    );
  } catch (error) {
    debugLogger.error(`Error saving migrated hooks: ${getErrorMessage(error)}`);
  }
}

export const migrateCommand: CommandModule = {
  command: 'migrate',
  describe: 'Migrate hooks from Claude Code to Gemini CLI',
  builder: (yargs) =>
    yargs.option('from-claude', {
      describe: 'Migrate from Claude Code hooks',
      type: 'boolean',
      default: false,
    }),
  handler: async (argv) => {
    const parsedArgs = migrateArgsSchema.parse(argv);
    if (parsedArgs['from-claude']) {
      await handleMigrateFromClaude();
    } else {
      debugLogger.log(
        'Usage: gemini hooks migrate --from-claude\n\nMigrate hooks from Claude Code to Gemini CLI format.',
      );
    }
    await exitCli();
  },
};
