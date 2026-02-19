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

    const entries = Object.entries(ExperimentMetadata);
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
      output += `${name} (${metadata.type})\n`;
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
    const rawValue = parts[1];
    const id = getExperimentFlagIdFromName(name);

    if (id === undefined) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Unknown experiment: ${name}`,
      });
      return;
    }

    const metadata = ExperimentMetadata[id];
    let value: boolean | number | string;

    if (metadata.type === 'boolean') {
      if (rawValue === 'true' || rawValue === 'on') value = true;
      else if (rawValue === 'false' || rawValue === 'off') value = false;
      else {
        context.ui.addItem({
          type: MessageType.ERROR,
          text: `Invalid boolean value: ${rawValue}. Use true/false or on/off.`,
        });
        return;
      }
    } else if (metadata.type === 'number') {
      value = Number(rawValue);
      if (isNaN(value)) {
        context.ui.addItem({
          type: MessageType.ERROR,
          text: `Invalid number value: ${rawValue}`,
        });
        return;
      }
    } else {
      value = rawValue;
    }

    const { settings } = context.services;
    const currentExperimental = {
      ...((settings.merged.experimental as Record<string, unknown>) || {}),
    };
    currentExperimental[name] = value;

    settings.setValue(SettingScope.User, 'experimental', currentExperimental);

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

    const { settings } = context.services;
    const currentExperimental = {
      ...((settings.merged.experimental as Record<string, unknown>) || {}),
    };

    if (!(name in currentExperimental)) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `No local override found for experiment: ${name}`,
      });
      return;
    }

    delete currentExperimental[name];
    settings.setValue(SettingScope.User, 'experimental', currentExperimental);

    context.ui.addItem({
      type: MessageType.INFO,
      text: `Local override for experiment ${name} removed.`,
    });
  },
};

export const experimentCommand: SlashCommand = {
  name: 'experiment',
  description: 'Manage experimental features',
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
