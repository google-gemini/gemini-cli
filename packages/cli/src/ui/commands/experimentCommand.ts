/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ExperimentMetadata,
  getExperimentFlagIdFromName,
  getExperimentFlagName,
} from '@google/gemini-cli-core';
import { z } from 'zod';
import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';
import { SettingScope } from '../../config/settings.js';

const listExperimentsCommand: SlashCommand = {
  name: 'list',
  description: 'List all available experiments and their current values',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    const { config } = context.services;
    if (!config) return;

    const entries = Object.entries(ExperimentMetadata).filter(
      ([, metadata]) => !metadata.hidden,
    );
    if (entries.length === 0) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: 'No experiments available.',
      });
      return;
    }

    let output = 'Available Experiments:\n\n';
    for (const [idStr, metadata] of entries) {
      const id = parseInt(idStr, 10);
      const name = getExperimentFlagName(id) || `ID: ${id}`;
      const value = config.getExperimentValue(id);
      output += `${name}\n`;
      output += `  Value: ${value}\n`;
      output += `  Description: ${metadata.description}\n`;
      output += `  Default: ${metadata.defaultValue}\n\n`;
    }

    context.ui.addItem({
      type: MessageType.INFO,
      text: output.trim(),
    });
  },
};

const setExperimentCommand: SlashCommand = {
  name: 'set',
  description:
    'Set a local override for an experiment. Usage: /experiment set <name> <value>',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args: string) => {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Usage: /experiment set <name> <value>',
      });
      return;
    }

    const name = parts[0];
    const rawValue = args.trim().substring(name.length).trim();
    const id = getExperimentFlagIdFromName(name);

    if (id === undefined) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Unknown experiment: ${name}`,
      });
      return;
    }

    const metadata = ExperimentMetadata[id];
    let value: unknown;

    // Helper to parse strings based on Zod schema type
    const parseValue = (raw: string, schema: z.ZodTypeAny): unknown => {
      if (schema instanceof z.ZodBoolean) {
        if (raw === 'true' || raw === 'on') return true;
        if (raw === 'false' || raw === 'off') return false;
        return raw;
      }
      if (schema instanceof z.ZodNumber) {
        return Number(raw);
      }
      return raw;
    };

    value = parseValue(rawValue, metadata.schema);
    const result = metadata.schema.safeParse(value);

    if (!result.success) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Invalid value for ${name}: ${rawValue}. Error: ${result.error.errors[0].message}`,
      });
      return;
    }

    value = result.data;

    const { settings, config } = context.services;
    if (!config) return;

    // SECURITY: Only persist user-scoped settings to prevent untrusted workspace settings
    // from being promoted to the global user configuration.
    const userExperimental = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      ...((settings.user.settings['experimental'] as Record<string, unknown>) ||
        {}),
    };
    userExperimental[name] = value;

    settings.setValue(SettingScope.User, 'experimental', userExperimental);

    // Update the live config with the merged state so it takes effect immediately
    const mergedExperimental = {
      ...((settings.merged.experimental as Record<string, unknown>) || {}),
      ...userExperimental,
    };
    config.updateExperimentalSettings(mergedExperimental);

    context.ui.addItem({
      type: MessageType.INFO,
      text: `Experiment ${name} set to ${value} (persisted in user settings).`,
    });
  },
};

const unsetExperimentCommand: SlashCommand = {
  name: 'unset',
  description:
    'Remove a local override for an experiment. Usage: /experiment unset <name>',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args: string) => {
    const name = args.trim();
    if (!name) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Usage: /experiment unset <name>',
      });
      return;
    }

    const { settings, config } = context.services;
    if (!config) return;

    const userExperimental = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      ...((settings.user.settings['experimental'] as Record<string, unknown>) ||
        {}),
    };

    if (!(name in userExperimental)) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `No local user override found for experiment: ${name}`,
      });
      return;
    }

    delete userExperimental[name];
    settings.setValue(SettingScope.User, 'experimental', userExperimental);

    // Update the live config with the new merged state
    const mergedExperimental = {
      ...((settings.merged.experimental as Record<string, unknown>) || {}),
    };
    delete mergedExperimental[name];
    config.updateExperimentalSettings(mergedExperimental);

    context.ui.addItem({
      type: MessageType.INFO,
      text: `Local user override for experiment ${name} removed.`,
    });
  },
};

export const experimentCommand: SlashCommand = {
  name: 'experiment',
  description: 'Manage experimental features',
  hidden: true,
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    listExperimentsCommand,
    setExperimentCommand,
    unsetExperimentCommand,
  ],
  action: async (context: CommandContext, args: string) =>
    listExperimentsCommand.action!(context, args),
};
