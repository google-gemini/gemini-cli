/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reusable logic for generating tool declarations that depend on runtime state
 * (OS, platforms, or dynamic schema values like available skills).
 */

import { type FunctionDeclaration } from '@google/genai';
import * as os from 'node:os';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  SHELL_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  ACTIVATE_SKILL_TOOL_NAME,
} from './base-declarations.js';

/**
 * Generates the platform-specific description for the shell tool.
 */
export function getShellToolDescription(
  enableInteractiveShell: boolean,
  enableEfficiency: boolean,
): string {
  const efficiencyGuidelines = enableEfficiency
    ? `

      Efficiency Guidelines:
      - Quiet Flags: Always prefer silent or quiet flags (e.g., \`npm install --silent\`, \`git --no-pager\`) to reduce output volume while still capturing necessary information.
      - Pagination: Always disable terminal pagination to ensure commands terminate (e.g., use \`git --no-pager\`, \`systemctl --no-pager\`, or set \`PAGER=cat\`).`
    : '';

  if (os.platform() === 'win32') {
    const backgroundInstructions = enableInteractiveShell
      ? 'To run a command in the background, set the `is_background` parameter to true. Do NOT use PowerShell background constructs.'
      : 'Command can start background processes using PowerShell constructs such as `Start-Process -NoNewWindow` or `Start-Job`.';
    return `This tool executes a given shell command as \`powershell.exe -NoProfile -Command <command>\`. ${backgroundInstructions}${efficiencyGuidelines}`;
  } else {
    const backgroundInstructions = enableInteractiveShell
      ? 'To run a command in the background, set the `is_background` parameter to true. Do NOT use `&` to background commands.'
      : 'Command can start background processes using `&`.';
    return `This tool executes a given shell command as \`bash -c <command>\`. ${backgroundInstructions}${efficiencyGuidelines}`;
  }
}

/**
 * Returns the platform-specific description for the 'command' parameter.
 */
export function getCommandDescription(): string {
  if (os.platform() === 'win32') {
    return 'Exact command to execute as `powershell.exe -NoProfile -Command <command>`';
  }
  return 'Exact bash command to execute as `bash -c <command>`';
}

/**
 * Returns the FunctionDeclaration for the shell tool.
 */
export function getShellDeclaration(
  enableInteractiveShell: boolean,
  enableEfficiency: boolean,
): FunctionDeclaration {
  return {
    name: SHELL_TOOL_NAME,
    description: getShellToolDescription(
      enableInteractiveShell,
      enableEfficiency,
    ),
    parametersJsonSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: getCommandDescription(),
        },
        description: {
          type: 'string',
          description:
            'Brief description of the command for the user. Be specific and concise. Ideally a single sentence. Can be up to 3 sentences for clarity. No line breaks.',
        },
        dir_path: {
          type: 'string',
          description:
            '(OPTIONAL) The path of the directory to run the command in. If not provided, the project root directory is used. Must be a directory within the workspace and must already exist.',
        },
        is_background: {
          type: 'boolean',
          description:
            'Set to true if this command should be run in the background (e.g. for long-running servers or watchers). The command will be started, allowed to run for a brief moment to check for immediate errors, and then moved to the background.',
        },
      },
      required: ['command'],
    },
  };
}

/**
 * Returns the FunctionDeclaration for exiting plan mode.
 */
export function getExitPlanModeDeclaration(
  plansDir: string,
): FunctionDeclaration {
  return {
    name: EXIT_PLAN_MODE_TOOL_NAME,
    description:
      'Signals that the planning phase is complete and requests user approval to start implementation.',
    parametersJsonSchema: {
      type: 'object',
      required: ['plan_path'],
      properties: {
        plan_path: {
          type: 'string',
          description: `The file path to the finalized plan (e.g., "${plansDir}/feature-x.md"). This path MUST be within the designated plans directory: ${plansDir}/`,
        },
      },
    },
  };
}

/**
 * Returns the FunctionDeclaration for activating a skill.
 */
export function getActivateSkillDeclaration(
  skillNames: string[],
): FunctionDeclaration {
  const availableSkillsHint =
    skillNames.length > 0
      ? ` (Available: ${skillNames.map((n) => `'${n}'`).join(', ')})`
      : '';

  let schema: z.ZodTypeAny;
  if (skillNames.length === 0) {
    schema = z.object({
      name: z.string().describe('No skills are currently available.'),
    });
  } else {
    schema = z.object({
      name: z
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        .enum(skillNames as [string, ...string[]])
        .describe('The name of the skill to activate.'),
    });
  }

  return {
    name: ACTIVATE_SKILL_TOOL_NAME,
    description: `Activates a specialized agent skill by name${availableSkillsHint}. Returns the skill's instructions wrapped in \`<activated_skill>\` tags. These provide specialized guidance for the current task. Use this when you identify a task that matches a skill's description. ONLY use names exactly as they appear in the \`<available_skills>\` section.`,
    parametersJsonSchema: zodToJsonSchema(schema),
  };
}
