/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
  CommandKind,
} from './types.js';
import { type HistoryItemProfilesList, MessageType } from '../types.js';
import { getErrorMessage } from '../../utils/errors.js';
import {
  listProfiles,
  switchProfile,
  getActiveProfile,
} from '@google/gemini-cli-core';

async function listAction(
  context: CommandContext,
  args: string,
): Promise<void | SlashCommandActionReturn> {
  const subArgs = args.trim().split(/\s+/);
  let useShowDescriptions = true;

  for (const arg of subArgs) {
    if (arg === 'nodesc' || arg === '--nodesc') {
      useShowDescriptions = false;
    }
  }

  const config = context.services.config;
  if (!config) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Could not retrieve configuration.',
    });
    return;
  }

  const profiles = listProfiles(config);
  const activeProfile = getActiveProfile(config);

  const profilesListItem: HistoryItemProfilesList = {
    type: MessageType.PROFILES_LIST,
    profiles,
    activeProfileName: activeProfile?.name,
    showDescriptions: useShowDescriptions,
  };

  context.ui.addItem(profilesListItem);
}

async function switchAction(
  context: CommandContext,
  args: string,
): Promise<void | SlashCommandActionReturn> {
  const profileName = args.trim();
  if (!profileName) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Please provide a profile name to switch to.',
    });
    return;
  }

  const config = context.services.config;
  if (!config) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Could not retrieve configuration.',
    });
    return;
  }

  try {
    await switchProfile(config, profileName);
    context.ui.addItem({
      type: MessageType.INFO,
      text: `Switched to profile: ${profileName}`,
    });
  } catch (error) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: `Failed to switch profile: ${getErrorMessage(error)}`,
    });
  }
}

async function reloadAction(
  context: CommandContext,
): Promise<void | SlashCommandActionReturn> {
  const config = context.services.config;
  if (!config) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Could not retrieve configuration.',
    });
    return;
  }

  try {
    await config.getProfileManager().load();
    context.ui.addItem({
      type: MessageType.INFO,
      text: 'Profiles reloaded successfully.',
    });
  } catch (error) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: `Failed to reload profiles: ${getErrorMessage(error)}`,
    });
  }
}

export const profilesCommand: SlashCommand = {
  name: 'profiles',
  description:
    'List, switch, or reload Gemini CLI profiles. Usage: /profiles [list | switch <name> | reload]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'list',
      description: 'List available profiles. Usage: /profiles list [nodesc]',
      kind: CommandKind.BUILT_IN,
      action: listAction,
    },
    {
      name: 'switch',
      description:
        'Switch to a profile by name. Usage: /profiles switch <name>',
      kind: CommandKind.BUILT_IN,
      action: switchAction,
    },
    {
      name: 'reload',
      description:
        'Reload the list of discovered profiles. Usage: /profiles reload',
      kind: CommandKind.BUILT_IN,
      action: reloadAction,
    },
  ],
  action: listAction,
};
