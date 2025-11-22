/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';
import { SettingScope } from '../../config/settings.js';
import type { HookDefinition } from '@google/gemini-cli-core';

export const hooksCommand: SlashCommand = {
  name: 'hooks',
  description: 'Manage hooks (list, enable, disable, reload)',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const config = context.services.config;
    if (!config) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Configuration not loaded.',
        },
        Date.now(),
      );
      return;
    }

    const registry = config.getHookRegistry();
    if (!registry) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: 'Hook registry not initialized.',
        },
        Date.now(),
      );
      return;
    }

    const parts = args.trim().split(/\s+/);
    const subCommand = parts[0];
    const target = parts.slice(1).join(' ');

    if (subCommand === 'reload') {
      await registry.initialize();
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: 'Hooks reloaded.',
        },
        Date.now(),
      );
      return;
    }

    if (subCommand === 'enable' || subCommand === 'disable') {
      if (!target) {
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: `Usage: /hooks ${subCommand} <hook-name>`,
          },
          Date.now(),
        );
        return;
      }
      const enabled = subCommand === 'enable';
      registry.setHookEnabled(target, enabled);

      // Persist the change to settings
      const settings = context.services.settings;
      const userHooks = settings.user.settings.hooks;

      if (userHooks) {
        // Deep copy to avoid mutation
        const newHooks = JSON.parse(JSON.stringify(userHooks));

        // Update enabled state in the copied hooks
        for (const definitions of Object.values(newHooks)) {
          if (Array.isArray(definitions)) {
            for (const def of definitions as HookDefinition[]) {
              for (const hook of def.hooks) {
                if (hook.type === 'command' && hook.command === target) {
                  hook.enabled = enabled;
                }
              }
            }
          }
        }

        // Persist to disk
        settings.setValue(SettingScope.User, 'hooks', newHooks);
      }

      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Hook "${target}" ${enabled ? 'enabled' : 'disabled'}.`,
        },
        Date.now(),
      );
      return;
    }

    // List (default)
    const hooks = registry.getAllHooks();
    if (hooks.length === 0) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: 'No hooks configured.',
        },
        Date.now(),
      );
      return;
    }

    const lines = ['## Active Hooks'];

    // Group by event name
    const byEvent: Record<string, typeof hooks> = {};
    for (const hook of hooks) {
      if (!byEvent[hook.eventName]) {
        byEvent[hook.eventName] = [];
      }
      byEvent[hook.eventName].push(hook);
    }

    for (const [event, entries] of Object.entries(byEvent)) {
      lines.push(`\n### ${event}`);
      for (const entry of entries) {
        const command = entry.config.command || '(plugin)';
        const status = entry.enabled ? '✅ Enabled' : '❌ Disabled';
        const matcher = entry.matcher ? ` (matcher: "${entry.matcher}")` : '';
        lines.push(`- ${status}: \`${command}\` [${entry.source}]${matcher}`);
      }
    }

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: lines.join('\n'),
      },
      Date.now(),
    );
  },
  completion: async (_context, _partialArg) => [
    'list',
    'enable',
    'disable',
    'reload',
  ],
};
