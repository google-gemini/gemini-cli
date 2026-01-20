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

interface MigrateArgs {
  fromClaude: boolean;
}

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

/**
 * Migrate a Claude Code hook configuration to Gemini format
 */
function migrateClaudeHook(claudeHook: unknown): unknown {
  if (!claudeHook || typeof claudeHook !== 'object') {
    return claudeHook;
  }

  const hook = claudeHook as Record<string, unknown>;
  const migrated: Record<string, unknown> = {};

  // Map command field
  if ('command' in hook) {
    migrated['command'] = hook['command'];

    // Replace CLAUDE_PROJECT_DIR with GEMINI_PROJECT_DIR in command
    if (typeof migrated['command'] === 'string') {
      migrated['command'] = migrated['command'].replace(
        /\$CLAUDE_PROJECT_DIR/g,
        '$GEMINI_PROJECT_DIR',
      );
    }
  }

  // Map type field
  if ('type' in hook && hook['type'] === 'command') {
    migrated['type'] = 'command';
  }

  // Map timeout field (Claude uses seconds, Gemini uses seconds)
  if ('timeout' in hook && typeof hook['timeout'] === 'number') {
    migrated['timeout'] = hook['timeout'];
  }

  return migrated;
}

/**
 * Migrate Claude Code hooks configuration to Gemini format
 */
function migrateClaudeHooks(claudeConfig: unknown): Record<string, unknown> {
  if (!claudeConfig || typeof claudeConfig !== 'object') {
    return {};
  }

  const config = claudeConfig as Record<string, unknown>;
  const geminiHooks: Record<string, unknown> = {};

  // Check if there's a hooks section
  const hooksSection = config['hooks'] as Record<string, unknown> | undefined;
  if (!hooksSection || typeof hooksSection !== 'object') {
    return {};
  }

  for (const [eventName, eventConfig] of Object.entries(hooksSection)) {
    // Map event name
    const geminiEventName = EVENT_MAPPING[eventName] || eventName;

    if (!Array.isArray(eventConfig)) {
      continue;
    }

    // Migrate each hook definition
    const migratedDefinitions = eventConfig.map((def: unknown) => {
      if (!def || typeof def !== 'object') {
        return def;
      }

      const definition = def as Record<string, unknown>;
      const migratedDef: Record<string, unknown> = {};

      // Transform matcher
      if (
        'matcher' in definition &&
        typeof definition['matcher'] === 'string'
      ) {
        migratedDef['matcher'] = transformMatcher(definition['matcher']);
      }

      // Copy sequential flag
      if ('sequential' in definition) {
        migratedDef['sequential'] = definition['sequential'];
      }

      // Migrate hooks array
      if ('hooks' in definition && Array.isArray(definition['hooks'])) {
        migratedDef['hooks'] = definition['hooks'].map(migrateClaudeHook);
      }

      return migratedDef;
    });

    geminiHooks[geminiEventName] = migratedDefinitions;
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
      claudeSettings = JSON.parse(stripJsonComments(content)) as Record<
        string,
        unknown
      >;
    } catch (error) {
      debugLogger.error(
        `Error reading ${claudeLocalSettingsPath}: ${getErrorMessage(error)}`,
      );
    }
  } else if (fs.existsSync(claudeSettingsPath)) {
    sourceFile = claudeSettingsPath;
    try {
      const content = fs.readFileSync(claudeSettingsPath, 'utf-8');
      claudeSettings = JSON.parse(stripJsonComments(content)) as Record<
        string,
        unknown
      >;
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

  if (Object.keys(migratedHooks).length === 0) {
    debugLogger.log('No hooks found in Claude Code settings to migrate.');
    return;
  }

  debugLogger.log(
    `Migrating ${Object.keys(migratedHooks).length} hook event(s)...`,
  );

  // Load current Gemini settings
  const settings = loadSettings(workingDir);

  // Merge migrated hooks with existing hooks
  const existingHooks = settings.merged.hooks as Record<string, unknown>;
  const mergedHooks = { ...existingHooks, ...migratedHooks };

  // Update settings (setValue automatically saves)
  try {
    settings.setValue(SettingScope.Workspace, 'hooks', mergedHooks);

    debugLogger.log('✓ Hooks successfully migrated to .gemini/settings.json');
    debugLogger.log(
      '\nMigration complete! Please review the migrated hooks in .gemini/settings.json',
    );
    debugLogger.log(
      'Note: Set hooks.enabled to true in your settings to enable the hook system.',
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
    const args = argv as unknown as MigrateArgs;
    if (args.fromClaude) {
      await handleMigrateFromClaude();
    } else {
      debugLogger.log(
        'Usage: gemini hooks migrate --from-claude\n\nMigrate hooks from Claude Code to Gemini CLI format.',
      );
    }
    await exitCli();
  },
};
