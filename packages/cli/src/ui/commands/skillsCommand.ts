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
import {
  MessageType,
  type HistoryItemSkillsList,
  type HistoryItemInfo,
} from '../types.js';
import { SettingScope } from '../../config/settings.js';
import { enableSkill, disableSkill } from '../../utils/skillSettings.js';
import { renderSkillActionFeedback } from '../../utils/skillUtils.js';

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
      location: skill.location,
      body: skill.body,
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

  const scope = context.services.settings.workspace.path
    ? SettingScope.Workspace
    : SettingScope.User;

  const result = disableSkill(context.services.settings, skillName, scope);

  let feedback = renderSkillActionFeedback(
    result,
    (label, path) => `${label} (${path})`,
  );
  if (result.status === 'success') {
    feedback += ' Use "/skills reload" for it to take effect.';
  }

  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: feedback,
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

  const result = enableSkill(context.services.settings, skillName);

  let feedback = renderSkillActionFeedback(
    result,
    (label, path) => `${label} (${path})`,
  );
  if (result.status === 'success') {
    feedback += ' Use "/skills reload" for it to take effect.';
  }

  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: feedback,
    },
    Date.now(),
  );
}

async function reloadAction(
  context: CommandContext,
): Promise<void | SlashCommandActionReturn> {
  const config = context.services.config;
  if (!config) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Could not retrieve configuration.',
      },
      Date.now(),
    );
    return;
  }

  const skillManager = config.getSkillManager();
  const beforeNames = new Set(skillManager.getSkills().map((s) => s.name));

  const startTime = Date.now();
  let pendingItemSet = false;
  const pendingTimeout = setTimeout(() => {
    context.ui.setPendingItem({
      type: MessageType.INFO,
      text: 'Reloading agent skills...',
    });
    pendingItemSet = true;
  }, 100);

  try {
    await config.reloadSkills();

    clearTimeout(pendingTimeout);
    if (pendingItemSet) {
      // If we showed the pending item, make sure it stays for at least 500ms
      // total to avoid a "flicker" where it appears and immediately disappears.
      const elapsed = Date.now() - startTime;
      const minVisibleDuration = 500;
      if (elapsed < minVisibleDuration) {
        await new Promise((resolve) =>
          setTimeout(resolve, minVisibleDuration - elapsed),
        );
      }
      context.ui.setPendingItem(null);
    }

    const afterSkills = skillManager.getSkills();
    const afterNames = new Set(afterSkills.map((s) => s.name));

    const added = afterSkills.filter((s) => !beforeNames.has(s.name));
    const removedCount = [...beforeNames].filter(
      (name) => !afterNames.has(name),
    ).length;

    let successText = 'Agent skills reloaded successfully.';
    const details: string[] = [];

    if (added.length > 0) {
      details.push(
        `${added.length} newly available skill${added.length > 1 ? 's' : ''}`,
      );
    }
    if (removedCount > 0) {
      details.push(
        `${removedCount} skill${removedCount > 1 ? 's' : ''} no longer available`,
      );
    }

    if (details.length > 0) {
      successText += ` ${details.join(' and ')}.`;
    }

    context.ui.addItem(
      {
        type: 'info',
        text: successText,
        icon: '✓ ',
        color: 'green',
      } as HistoryItemInfo,
      Date.now(),
    );
  } catch (error) {
    clearTimeout(pendingTimeout);
    if (pendingItemSet) {
      context.ui.setPendingItem(null);
    }
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Failed to reload skills: ${error instanceof Error ? error.message : String(error)}`,
      },
      Date.now(),
    );
  }
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
    'List, enable, disable, or reload Gemini CLI agent skills. Usage: /skills [list | disable <name> | enable <name> | reload]',
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
    {
      name: 'reload',
      description:
        'Reload the list of discovered skills. Usage: /skills reload',
      kind: CommandKind.BUILT_IN,
      action: reloadAction,
    },
  ],
  action: listAction,
};
