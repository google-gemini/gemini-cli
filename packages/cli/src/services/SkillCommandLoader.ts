/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config, ACTIVATE_SKILL_TOOL_NAME } from '@google/gemini-cli-core';
import { CommandKind, type SlashCommand } from '../ui/commands/types.js';
import { type ICommandLoader } from './types.js';

/**
 * Loads Agent Skills as slash commands.
 */
export class SkillCommandLoader implements ICommandLoader {
  constructor(private config: Config | null) {}

  /**
   * Discovers all available skills from the SkillManager and converts
   * them into executable slash commands.
   *
   * @param _signal An AbortSignal (unused for this synchronous loader).
   * @returns A promise that resolves to an array of `SlashCommand` objects.
   */
  async loadCommands(_signal: AbortSignal): Promise<SlashCommand[]> {
    if (!this.config || !this.config.isSkillsSupportEnabled()) {
      return [];
    }

    const skillManager = this.config.getSkillManager();
    if (!skillManager || !skillManager.isAdminEnabled()) {
      return [];
    }

    // Convert all displayable skills into slash commands.
    const skills = skillManager.getDisplayableSkills();

    return skills.map((skill) => {
      const commandName = skill.name.trim().replace(/\s+/g, '-');
      return {
        name: commandName,
        description: skill.description || `Activate the ${skill.name} skill`,
        kind: CommandKind.SKILL,
        autoExecute: true,
        extensionName: skill.extensionName,
        action: async (_context, args) => ({
          type: 'tool',
          toolName: ACTIVATE_SKILL_TOOL_NAME,
          toolArgs: { name: skill.name },
          postSubmitPrompt: getSkillPostSubmitPrompt(skill.name, args),
        }),
      };
    });
  }
}

/**
 * Builds the prompt sent to the model after a skill is activated via its
 * slash command. Explicit arguments are passed through as the task. Without
 * arguments, the model is told to apply the skill to the task already in
 * progress, or to ask the user what to use it for.
 */
export function getSkillPostSubmitPrompt(
  skillName: string,
  args: string,
): string {
  const task = args.trim();
  if (task.length > 0) {
    return task;
  }
  return (
    `I manually activated the "${skillName}" skill. If there is a task in ` +
    `progress in this conversation, continue it following the skill's ` +
    `instructions. Otherwise, briefly describe what the skill helps with and ` +
    `ask me what I would like to use it for.`
  );
}
