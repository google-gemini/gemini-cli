/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
  CommandKind,
} from './types.js';
import { MessageType, type HistoryItemSkillsList } from '../types.js';
import { SettingScope } from '../../config/settings.js';

async function listAction(
  context: CommandContext,
  args: string,
): Promise<void | SlashCommandActionReturn> {
  const subCommand = args.trim();

  // Default to SHOWING descriptions. The user can hide them with 'nodesc'.
  let useShowDescriptions = true;
  if (subCommand === 'nodesc') {
    useShowDescriptions = false;
  }

  const skillManager = context.services.config?.getSkillManager();
  if (!skillManager) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Could not retrieve skill manager.',
      },
      Date.now(),
    );
    return;
  }

  const skills = skillManager.getAllSkills();

  const skillsListItem: HistoryItemSkillsList = {
    type: MessageType.SKILLS_LIST,
    skills: skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      disabled: skill.disabled,
    })),
    showDescriptions: useShowDescriptions,
  };

  context.ui.addItem(skillsListItem, Date.now());
}

async function disableAction(
  context: CommandContext,
  args: string,
): Promise<void | SlashCommandActionReturn> {
  const skillName = args.trim();
  if (!skillName) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Please provide a skill name to disable.',
      },
      Date.now(),
    );
    return;
  }
  const skillManager = context.services.config?.getSkillManager();
  const skill = skillManager?.getSkill(skillName);
  if (!skill) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Skill "${skillName}" not found.`,
      },
      Date.now(),
    );
    return;
  }

  const currentDisabled =
    context.services.settings.merged.skills?.disabled ?? [];
  if (currentDisabled.includes(skillName)) {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Skill "${skillName}" is already disabled.`,
      },
      Date.now(),
    );
    return;
  }

  const newDisabled = [...currentDisabled, skillName];
  const scope = context.services.settings.workspace.path
    ? SettingScope.Workspace
    : SettingScope.User;

  context.services.settings.setValue(scope, 'skills.disabled', newDisabled);
  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: `Skill "${skillName}" disabled in ${scope} settings. Restart required to take effect.`,
    },
    Date.now(),
  );
}

async function enableAction(
  context: CommandContext,
  args: string,
): Promise<void | SlashCommandActionReturn> {
  const skillName = args.trim();
  if (!skillName) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Please provide a skill name to enable.',
      },
      Date.now(),
    );
    return;
  }

  const currentDisabled =
    context.services.settings.merged.skills?.disabled ?? [];
  if (!currentDisabled.includes(skillName)) {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Skill "${skillName}" is not disabled.`,
      },
      Date.now(),
    );
    return;
  }

  const newDisabled = currentDisabled.filter((name) => name !== skillName);
  const scope = context.services.settings.workspace.path
    ? SettingScope.Workspace
    : SettingScope.User;

  context.services.settings.setValue(scope, 'skills.disabled', newDisabled);
  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: `Skill "${skillName}" enabled in ${scope} settings. Restart required to take effect.`,
    },
    Date.now(),
  );
}

function disableCompletion(
  context: CommandContext,
  partialArg: string,
): string[] {
  const skillManager = context.services.config?.getSkillManager();
  if (!skillManager) {
    return [];
  }
  return skillManager
    .getAllSkills()
    .filter((s) => !s.disabled && s.name.startsWith(partialArg))
    .map((s) => s.name);
}

function enableCompletion(
  context: CommandContext,
  partialArg: string,
): string[] {
  const skillManager = context.services.config?.getSkillManager();
  if (!skillManager) {
    return [];
  }
  return skillManager
    .getAllSkills()
    .filter((s) => s.disabled && s.name.startsWith(partialArg))
    .map((s) => s.name);
}

export const skillsCommand: SlashCommand = {
  name: 'skills',
  description:
    'List, enable, or disable Gemini CLI agent skills. Usage: /skills [list | disable <name> | enable <name>]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'list',
      description: 'List available agent skills. Usage: /skills list [nodesc]',
      kind: CommandKind.BUILT_IN,
      action: listAction,
    },
    {
      name: 'disable',
      description: 'Disable a skill by name. Usage: /skills disable <name>',
      kind: CommandKind.BUILT_IN,
      action: disableAction,
      completion: disableCompletion,
    },
    {
      name: 'enable',
      description:
        'Enable a disabled skill by name. Usage: /skills enable <name>',
      kind: CommandKind.BUILT_IN,
      action: enableAction,
      completion: enableCompletion,
    },
  ],
  action: listAction,
};
