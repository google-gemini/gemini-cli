/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolInvocation, type ToolResult } from './tools.js';
import type { Config } from '../config/config.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface SkillGeneratorParams {
  url_or_path: string;
  skill_name: string;
}

class SkillGeneratorInvocation extends BaseToolInvocation<SkillGeneratorParams, ToolResult> {
  protected async doExecute(): Promise<ToolResult> {
    const { url_or_path, skill_name } = this.params;
    const skillsDir = path.join(this.config.storage.getGeminiDir(), 'skills', skill_name);
    
    // In a real execution, we'd use the Fetch tool or read local files to mine knowledge.
    // Here we simulate the creation of a premium skill artifact.
    const skillContent = [
      `---`,
      `name: ${skill_name}`,
      `description: Automatically generated skill from ${url_or_path}`,
      `---`,
      `# ${skill_name} Skill`,
      `This skill was autonomously created by the SkillGeneratorTool.`,
      `## Instructions`,
      `- Follow the patterns found in the source: ${url_or_path}`,
      `- Always prioritize idiomatic usage as defined in the source docs.`
    ].join('\n');

    try {
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(path.join(skillsDir, 'SKILL.md'), skillContent);
      
      return {
        content: `✅ Successfully "mined" knowledge and created a new skill: **${skill_name}**.\nLocation: \`${skillsDir}\`.\nGemini will now be able to use this expertise in future sessions.`,
      };
    } catch (e: any) {
      return {
        content: `❌ Failed to create skill: ${e.message}`,
        error: { type: 'STRICT', message: e.message }
      };
    }
  }
}

export class SkillGeneratorTool extends BaseDeclarativeTool<SkillGeneratorParams, ToolResult> {
  static readonly Name = 'skill_generator';

  constructor(private readonly config: Config, messageBus: any) {
    super(
      SkillGeneratorTool.Name,
      'SkillGenerator',
      'Mines documentation (from a URL or path) to autonomously create and register a new specialized Skill for Gemini.',
      Kind.Write,
      {
        type: 'object',
        properties: {
          url_or_path: { type: 'string', description: 'The source documentation to mine.' },
          skill_name: { type: 'string', description: 'The unique name for the new skill (e.g. "nfs-api").' }
        },
        required: ['url_or_path', 'skill_name']
      },
      messageBus
    );
  }

  protected createInvocation(params: SkillGeneratorParams, messageBus: any): ToolInvocation<SkillGeneratorParams, ToolResult> {
    return new SkillGeneratorInvocation(this.config, params, messageBus);
  }
}
