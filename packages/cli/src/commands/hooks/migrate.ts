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
import { loadSettings, SettingScope } from '../../config/settings.js';

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

      // Merge hooks using upsert mechanism (truly idempotent)
      // Use a deep copy to ensure we don't mutate the loaded settings directly
      const newHooks = JSON.parse(
        JSON.stringify(userSettings.settings.hooks || {}),
      );
      for (const [event, definitions] of Object.entries(geminiHooks)) {
        const eventName = event as HookEventName;
        if (!newHooks[eventName]) {
          newHooks[eventName] = [];
        }
        const existingEventDefinitions = newHooks[eventName];

        for (const newDef of definitions) {
          const newCommandSet = new Set(newDef.hooks.map((h) => h.command));
          if (newCommandSet.size === 0) continue;

          const existingDefIndex = existingEventDefinitions.findIndex(
            (d: HookDefinition) => d.matcher === newDef.matcher,
          );

          if (existingDefIndex !== -1) {
            // A definition with the same matcher exists. Overwrite it to "update".
            existingEventDefinitions[existingDefIndex] = newDef;
          } else {
            // No definition with this matcher, so add it as a new one.
            existingEventDefinitions.push(newDef);
          }
        }
      }

      // Enable hooks in tools settings
      const existingTools = userSettings.settings.tools || {};
      const newTools = { ...existingTools, enableHooks: true };

      // Save settings using the robust setValue API which handles originalSettings update and saving
      loadedSettings.setValue(SettingScope.User, 'hooks', newHooks);
      loadedSettings.setValue(SettingScope.User, 'tools', newTools);

      console.log('Successfully migrated hooks to ~/.gemini/settings.json');
      console.log(`Enabled ${Object.keys(geminiHooks).length} hook events.`);
    } catch (error) {
      console.error('Failed to migrate hooks:', error);
      throw error;
    }
  },
};
