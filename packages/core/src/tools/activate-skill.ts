/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as path from 'node:path';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { Config } from '../config/config.js';
import { ACTIVATE_SKILL_TOOL_NAME } from './tool-names.js';

/**
 * Parameters for the ActivateSkill tool
 */
export interface ActivateSkillToolParams {
  /**
   * The name of the skill to activate
   */
  name: string;
}

class ActivateSkillToolInvocation extends BaseToolInvocation<ActivateSkillToolParams> {
  constructor(
    private config: Config,
    params: ActivateSkillToolParams,
    messageBus: MessageBus | undefined,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const skillName = this.params.name;
    const skill = this.config
      .getSkillManager()
      .getAllSkills()
      .find((s) => s.name === skillName);
    if (skill) {
      return `"${skillName}": ${skill.description}`;
    }
    return `"${skillName}"`;
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (!this.messageBus) {
      return false;
    }

    const skillName = this.params.name;
    const skill = this.config
      .getSkillManager()
      .getSkills()
      .find((s) => s.name === skillName);

    if (!skill) {
      return false;
    }

    const folderStructure = await getFolderStructure(
      path.dirname(skill.location),
      {
        ignoredFolders: new Set(['node_modules', '.git', '__pycache__']),
      },
    );

    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: `Activate Skill: ${skillName}`,
      prompt: `You are about to enable the specialized agent skill **${skillName}**.

**Description:**
${skill.description}

**Resources to be shared with the model:**
${folderStructure}`,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        await this.publishPolicyUpdate(outcome);
      },
    };
    return confirmationDetails;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const skillName = this.params.name;
    const skillManager = this.config.getSkillManager();
    const skills = skillManager.getSkills();
    const skill = skills.find((s) => s.name === skillName);

    if (!skill) {
      return {
        llmContent: `Error: Skill "${skillName}" not found. Available skills are: ${skills.map((s) => s.name).join(', ')}`,
        returnDisplay: `Skill "${skillName}" not found.`,
      };
    }

    const content = await skillManager.getSkillContent(skillName);
    if (!content) {
      return {
        llmContent: `Error: Could not read content for skill "${skillName}".`,
        returnDisplay: `Error reading skill "${skillName}".`,
      };
    }

    skillManager.activateSkill(skillName);

    const folderStructure = await getFolderStructure(
      path.dirname(skill.location),
      {
        ignoredFolders: new Set(['node_modules', '.git', '__pycache__']),
      },
    );

    return {
      llmContent: `Skill "${skillName}" activated successfully. 

### Specialized Skill Guidance
The following instructions for "${skillName}" provide the primary procedural framework for your current task. You should prioritize these specialized rules and steps over your general internal defaults. Follow them strictly and sequentially while continuing to uphold your core safety and security standards.

### Available Resources
Below is the file structure of the "${skillName}" skill directory. You can use these resources (scripts, references, assets) as needed to complete your task.

${folderStructure}

# Skill: ${content.name}
${content.body}`,
      returnDisplay: `Skill **${skillName}** activated. Resources loaded from \`${path.dirname(skill.location)}\`:\n\n${folderStructure}`,
    };
  }
}

/**
 * Implementation of the ActivateSkill tool logic
 */
export class ActivateSkillTool extends BaseDeclarativeTool<
  ActivateSkillToolParams,
  ToolResult
> {
  static readonly Name = ACTIVATE_SKILL_TOOL_NAME;

  constructor(
    private config: Config,
    messageBus?: MessageBus,
  ) {
    const skills = config.getSkillManager().getSkills();
    const skillNames = skills.map((s) => s.name);

    let schema: z.ZodTypeAny;
    if (skillNames.length === 0) {
      schema = z.object({
        name: z.string().describe('No skills are currently available.'),
      });
    } else {
      schema = z.object({
        name: z
          .enum(skillNames as [string, ...string[]])
          .describe('The name of the skill to activate.'),
      });
    }

    super(
      ActivateSkillTool.Name,
      'Activate Skill',
      "Activates a specialized agent skill by name. Once activated, the skill's full instructions and rules are returned as a tool result and injected into the conversation. You MUST strictly follow these instructions for all subsequent turns. Use this when you identify a task that matches a skill's description.",
      Kind.Other,
      zodToJsonSchema(schema),
      true,
      false,
      messageBus,
    );
  }

  protected createInvocation(
    params: ActivateSkillToolParams,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<ActivateSkillToolParams, ToolResult> {
    return new ActivateSkillToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName ?? 'Activate Skill',
    );
  }
}
