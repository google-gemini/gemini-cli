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

function isRecord(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

/**
 * Migrate a Claude Code hook configuration to Gemini format
 */
function migrateClaudeHook(claudeHook: unknown): unknown {
  if (!isRecord(claudeHook)) {
    return claudeHook;
  }

  const hook = claudeHook;
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
  if (!isRecord(claudeConfig)) {
    return {};
  }

  const geminiHooks: Record<string, unknown> = {};

  // Check if there's a hooks section
  const hooksSection = claudeConfig['hooks'];
  if (!isRecord(hooksSection)) {
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
      if (!isRecord(def)) {
        return def;
      }

      const migratedDef: Record<string, unknown> = {};

      // Transform matcher
      if ('matcher' in def && typeof def['matcher'] === 'string') {
        migratedDef['matcher'] = transformMatcher(def['matcher']);
      }

      // Copy sequential flag
      if ('sequential' in def) {
        migratedDef['sequential'] = def['sequential'];
      }

      // Migrate hooks array
      if ('hooks' in def && Array.isArray(def['hooks'])) {
        migratedDef['hooks'] = def['hooks'].map(migrateClaudeHook);
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
      const parsed = JSON.parse(stripJsonComments(content));
      if (isRecord(parsed)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
        claudeSettings = parsed as any;
      }
    } catch (error) {
      debugLogger.error(
        `Error reading ${claudeLocalSettingsPath}: ${getErrorMessage(error)}`,
      );
    }
  } else if (fs.existsSync(claudeSettingsPath)) {
    sourceFile = claudeSettingsPath;
    try {
      const content = fs.readFileSync(claudeSettingsPath, 'utf-8');
      const parsed = JSON.parse(stripJsonComments(content));
      if (isRecord(parsed)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
        claudeSettings = parsed as any;
      }
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
  const existingHooks = (settings.merged?.hooks || {}) as Record<
    string,
    unknown
  >;
  const mergedHooks = { ...existingHooks, ...migratedHooks };

  // Update settings (setValue automatically saves)
  try {
    settings.setValue(SettingScope.Workspace, 'hooks', mergedHooks);

    debugLogger.log('✓ Hooks successfully migrated to .gemini/settings.json');
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
    const fromClaude = argv['from-claude'];
    if (typeof fromClaude === 'boolean' && fromClaude) {
      await handleMigrateFromClaude();
    } else {
      debugLogger.log(
        'Usage: gemini hooks migrate --from-claude\n\nMigrate hooks from Claude Code to Gemini CLI format.',
      );
    }
    await exitCli();
  },
};
