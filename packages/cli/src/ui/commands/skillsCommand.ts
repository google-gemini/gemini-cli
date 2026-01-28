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
import { t } from '../../i18n/index.js';
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
  const subArgs = args.trim().split(/\s+/);

  // Default to SHOWING descriptions. The user can hide them with 'nodesc'.
  let useShowDescriptions = true;
  let showAll = false;

  for (const arg of subArgs) {
    if (arg === 'nodesc' || arg === '--nodesc') {
      useShowDescriptions = false;
    } else if (arg === 'all' || arg === '--all') {
      showAll = true;
    }
  }

  const skillManager = context.services.config?.getSkillManager();
  if (!skillManager) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:skills.responses.managerFailed'),
    });
    return;
  }

  const skills = showAll
    ? skillManager.getAllSkills()
    : skillManager.getAllSkills().filter((s) => !s.isBuiltin);

  const skillsListItem: HistoryItemSkillsList = {
    type: MessageType.SKILLS_LIST,
    skills: skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      disabled: skill.disabled,
      location: skill.location,
      body: skill.body,
      isBuiltin: skill.isBuiltin,
    })),
    showDescriptions: useShowDescriptions,
  };

  context.ui.addItem(skillsListItem);
}

async function disableAction(
  context: CommandContext,
  args: string,
): Promise<void | SlashCommandActionReturn> {
  const skillName = args.trim();
  if (!skillName) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:skills.responses.missingNameDisable'),
    });
    return;
  }
  const skillManager = context.services.config?.getSkillManager();
  if (skillManager?.isAdminEnabled() === false) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: t('commands:skills.responses.adminDisabled'),
      },
      Date.now(),
    );
    return;
  }

  const skill = skillManager?.getSkill(skillName);
  if (!skill) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: t('commands:skills.responses.notFound', { name: skillName }),
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
  if (result.status === 'success' || result.status === 'no-op') {
    feedback += t('commands:skills.responses.reloadHint');
  }

  context.ui.addItem({
    type: MessageType.INFO,
    text: feedback,
  });
}

async function enableAction(
  context: CommandContext,
  args: string,
): Promise<void | SlashCommandActionReturn> {
  const skillName = args.trim();
  if (!skillName) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:skills.responses.missingNameEnable'),
    });
    return;
  }

  const skillManager = context.services.config?.getSkillManager();
  if (skillManager?.isAdminEnabled() === false) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: t('commands:skills.responses.adminDisabled'),
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
  if (result.status === 'success' || result.status === 'no-op') {
    feedback += t('commands:skills.responses.reloadHint');
  }

  context.ui.addItem({
    type: MessageType.INFO,
    text: feedback,
  });
}

async function reloadAction(
  context: CommandContext,
): Promise<void | SlashCommandActionReturn> {
  const config = context.services.config;
  if (!config) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:skills.responses.configFailed'),
    });
    return;
  }

  const skillManager = config.getSkillManager();
  const beforeNames = new Set(skillManager.getSkills().map((s) => s.name));

  const startTime = Date.now();
  let pendingItemSet = false;
  const pendingTimeout = setTimeout(() => {
    context.ui.setPendingItem({
      type: MessageType.INFO,
      text: t('commands:skills.responses.reloading'),
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

    let successText = t('commands:skills.responses.reloadSuccess');
    const details: string[] = [];

    if (added.length > 0) {
      details.push(
        t('commands:skills.responses.newlyAvailable', { count: added.length }),
      );
    }
    if (removedCount > 0) {
      details.push(
        t('commands:skills.responses.noLongerAvailable', {
          count: removedCount,
        }),
      );
    }

    if (details.length > 0) {
      successText += ` ${details.join(' and ')}.`;
    }

    context.ui.addItem({
      type: 'info',
      text: successText,
      icon: '✓ ',
      color: 'green',
    } as HistoryItemInfo);
  } catch (error) {
    clearTimeout(pendingTimeout);
    if (pendingItemSet) {
      context.ui.setPendingItem(null);
    }
    context.ui.addItem({
      type: MessageType.ERROR,
      text: t('commands:skills.responses.reloadFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    });
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
      description:
        'List available agent skills. Usage: /skills list [nodesc] [all]',
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
