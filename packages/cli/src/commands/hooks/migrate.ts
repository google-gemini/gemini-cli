/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import {
  HookEventName,
  HookType,
  type HookConfig,
  type HookDefinition,
} from '@google/gemini-cli-core';
import type { CommandModule } from 'yargs';
import stripJsonComments from 'strip-json-comments';
import { saveSettings, loadSettings } from '../../config/settings.js';

const CLAUDE_SETTINGS_PATH = path.join(homedir(), '.claude', 'settings.json');

interface ClaudeHookConfig {
  type: string;
  command: string;
  timeout?: number;
}

interface ClaudeHookDefinition {
  hooks: ClaudeHookConfig[];
  matcher?: string;
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeHookDefinition[]>;
}

const EVENT_MAPPING: Record<string, HookEventName> = {
  SessionStart: HookEventName.SessionStart,
  SessionEnd: HookEventName.SessionEnd,
  PreCompact: HookEventName.PreCompress,
  UserPromptSubmit: HookEventName.BeforeAgent,
  PostToolUse: HookEventName.AfterTool,
  Stop: HookEventName.AfterAgent,
};

export const migrateCommand: CommandModule = {
  command: 'migrate',
  describe: 'Migrate hooks from Claude Code configuration',
  builder: (yargs) =>
    yargs.option('from-claude', {
      type: 'boolean',
      description: 'Migrate from Claude Code settings',
      default: true,
    }),
  handler: async () => {
    console.log('Migrating hooks from Claude Code...');

    if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) {
      console.error(
        `Claude settings file not found at ${CLAUDE_SETTINGS_PATH}`,
      );
      return;
    }

    try {
      const claudeContent = fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8');
      const claudeSettings = JSON.parse(
        stripJsonComments(claudeContent),
      ) as ClaudeSettings;

      if (!claudeSettings.hooks) {
        console.log('No hooks found in Claude configuration.');
        return;
      }

      const geminiHooks: Record<string, HookDefinition[]> = {};

      for (const [claudeEvent, definitions] of Object.entries(
        claudeSettings.hooks,
      )) {
        const geminiEvent = EVENT_MAPPING[claudeEvent];
        if (!geminiEvent) {
          console.warn(`Skipping unknown Claude event: ${claudeEvent}`);
          continue;
        }

        geminiHooks[geminiEvent] = definitions.map((def) => {
          const hooks = def.hooks.map((hook): HookConfig => {
            let command = hook.command;
            // Replace ~/.claude/hooks with ~/.gemini/hooks
            if (command.includes('.claude/hooks')) {
              command = command.replace('.claude/hooks', '.gemini/hooks');
            }

            return {
              type: HookType.Command,
              command,
              // Claude timeouts are in seconds; converting to milliseconds for Gemini.
              timeout: hook.timeout ? hook.timeout * 1000 : undefined,
            };
          });
          return {
            hooks,
            matcher: def.matcher,
          };
        });
      }

      // Load existing Gemini settings
      const loadedSettings = loadSettings();
      const userSettings = loadedSettings.user;

      // Merge hooks
      if (!userSettings.settings.hooks) {
        userSettings.settings.hooks = {};
      }

      // We append/overwrite based on event
      Object.assign(userSettings.settings.hooks, geminiHooks);

      // Save settings
      userSettings.settings.tools = userSettings.settings.tools || {};
      userSettings.settings.tools.enableHooks = true;

      // Update originalSettings as well to ensure save works correctly
      userSettings.originalSettings.hooks = userSettings.settings.hooks;
      userSettings.originalSettings.tools = userSettings.settings.tools;

      saveSettings(userSettings);

      console.log('Successfully migrated hooks to ~/.gemini/settings.json');
      console.log(`Enabled ${Object.keys(geminiHooks).length} hook events.`);

      process.exit(0);
    } catch (error) {
      console.error('Failed to migrate hooks:', error);
      process.exit(1);
    }
  },
};
