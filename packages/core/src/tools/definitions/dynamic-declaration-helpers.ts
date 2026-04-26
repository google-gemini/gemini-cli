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
  SHELL_PARAM_COMMAND,
  PARAM_DESCRIPTION,
  PARAM_DIR_PATH,
  SHELL_PARAM_IS_BACKGROUND,
  EXIT_PLAN_PARAM_PLAN_FILENAME,
  SKILL_PARAM_NAME,
  PARAM_ADDITIONAL_PERMISSIONS,
  UPDATE_TOPIC_TOOL_NAME,
  TOPIC_PARAM_TITLE,
  TOPIC_PARAM_SUMMARY,
  TOPIC_PARAM_STRATEGIC_INTENT,
} from './base-declarations.js';

/**
 * Generates the platform-specific description for the shell tool.
 */
export function getShellToolDescription(
  enableInteractiveShell: boolean,
  enableEfficiency: boolean,
  enableWindowsBash: boolean = false,
): string {
  const efficiencyGuidelines = enableEfficiency
    ? `

      Efficiency Guidelines:
      - Quiet Flags: Always prefer silent or quiet flags (e.g., \`npm install --silent\`, \`git --no-pager\`) to reduce output volume while still capturing necessary information.
      - Pagination: Always disable terminal pagination to ensure commands terminate (e.g., use \`git --no-pager\`, \`systemctl --no-pager\`, or set \`PAGER=cat\`).`
    : '';

  const returnedInfo = `

      The following information is returned:

      Output: Combined stdout/stderr. Can be \`(empty)\` or partial on error and for any unwaited background processes.
      Exit Code: Only included if non-zero (command failed).
      Error: Only included if a process-level error occurred (e.g., spawn failure).
      Signal: Only included if process was terminated by a signal.
      Background PIDs: Only included if background processes were started.
      Process Group PGID: Only included if available.`;

  if (os.platform() === 'win32' && !enableWindowsBash) {
    const backgroundInstructions = enableInteractiveShell
      ? `To run a command in the background, set the \`${SHELL_PARAM_IS_BACKGROUND}\` parameter to true. Do NOT use PowerShell background constructs.`
      : 'Command can start background processes using PowerShell constructs such as `Start-Process -NoNewWindow` or `Start-Job`.';
    return `This tool executes a given shell command as \`powershell.exe -NoProfile -Command <command>\`. ${backgroundInstructions}${efficiencyGuidelines}${returnedInfo}`;
  } else {
    const backgroundInstructions = enableInteractiveShell
      ? `To run a command in the background, set the \`${SHELL_PARAM_IS_BACKGROUND}\` parameter to true. Do NOT use \`&\` to background commands.`
      : 'Command can start background processes using `&`.';
    return `This tool executes a given shell command as \`bash -c <command>\`. ${backgroundInstructions} Command is executed as a subprocess that leads its own process group. Command process group can be terminated as \`kill -- -PGID\` or signaled as \`kill -s SIGNAL -- -PGID\`.${efficiencyGuidelines}${returnedInfo}`;
  }
}

/**
 * Returns the platform-specific description for the 'command' parameter.
 */
export function getCommandDescription(
  enableWindowsBash: boolean = false,
): string {
  if (os.platform() === 'win32' && !enableWindowsBash) {
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
  enableToolSandboxing: boolean = false,
  enableWindowsBash: boolean = false,
): FunctionDeclaration {
  return {
    name: SHELL_TOOL_NAME,
    description: getShellToolDescription(
      enableInteractiveShell,
      enableEfficiency,
      enableWindowsBash,
    ),
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [SHELL_PARAM_COMMAND]: {
          type: 'string',
          description: getCommandDescription(enableWindowsBash),
        },
        [PARAM_DESCRIPTION]: {
          type: 'string',
          description:
            'Brief description of the command for the user. Be specific and concise. Ideally a single sentence. Can be up to 3 sentences for clarity. No line breaks.',
        },
        [PARAM_DIR_PATH]: {
          type: 'string',
          description:
            '(OPTIONAL) The path of the directory to run the command in. If not provided, the project root directory is used. Must be a directory within the workspace and must already exist.',
        },
        [SHELL_PARAM_IS_BACKGROUND]: {
          type: 'boolean',
          description:
            'Set to true if this command should be run in the background (e.g. for long-running servers or watchers). The command will be started, allowed to run for a brief moment to check for immediate errors, and then moved to the background.',
        },
        delay_ms: {
          type: 'integer',
          description:
            'Optional. Delay in milliseconds to wait after starting the process in the background. Useful to allow the process to start and generate initial output before returning.',
        },
        ...(enableToolSandboxing
          ? {
              [PARAM_ADDITIONAL_PERMISSIONS]: {
                type: 'object',
                description:
                  'Sandbox permissions for the command. Use this to request additional sandboxed filesystem or network permissions if a previous command failed with "Operation not permitted".',
                properties: {
                  network: {
                    type: 'boolean',
                    description:
                      'Set to true to enable network access for this command.',
                  },
                  fileSystem: {
                    type: 'object',
                    properties: {
                      read: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                          'List of additional absolute paths to allow reading.',
                      },
                      write: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                          'List of additional absolute paths to allow writing.',
                      },
                    },
                  },
                },
              },
            }
          : {}),
      },
      required: [SHELL_PARAM_COMMAND],
    },
  };
}

/**
 * Returns the FunctionDeclaration for exiting plan mode.
 */
export function getExitPlanModeDeclaration(): FunctionDeclaration {
  return {
    name: EXIT_PLAN_MODE_TOOL_NAME,
    description:
      'Finalizes the planning phase and transitions to implementation by presenting the plan for formal user approval. You MUST reach an informal agreement with the user in the chat regarding the proposed strategy BEFORE calling this tool. This tool MUST be used to exit Plan Mode before any source code edits can be performed.',
    parametersJsonSchema: {
      type: 'object',
      required: [EXIT_PLAN_PARAM_PLAN_FILENAME],
      properties: {
        [EXIT_PLAN_PARAM_PLAN_FILENAME]: {
          type: 'string',
          description: `The filename of the finalized plan (e.g., "feature-x.md"). Do not provide an absolute path.`,
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
      [SKILL_PARAM_NAME]: z
        .string()
        .describe('No skills are currently available.'),
    });
  } else {
    schema = z.object({
      [SKILL_PARAM_NAME]: z
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

/**
 * Returns the FunctionDeclaration for updating the topic context.
 */
export function getUpdateTopicDeclaration(): FunctionDeclaration {
  return {
    name: UPDATE_TOPIC_TOOL_NAME,
    description:
      'Manages your narrative flow. Include `title` and `summary` only when starting a new Chapter (logical phase) or shifting strategic intent.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [TOPIC_PARAM_TITLE]: {
          type: 'string',
          description: 'The title of the new topic or chapter.',
        },
        [TOPIC_PARAM_SUMMARY]: {
          type: 'string',
          description:
            '(OPTIONAL) A detailed summary (5-10 sentences) covering both the work completed in the previous topic and the strategic intent of the new topic. This is required when transitioning between topics to maintain continuity.',
        },
        [TOPIC_PARAM_STRATEGIC_INTENT]: {
          type: 'string',
          description:
            'A mandatory one-sentence statement of your immediate intent.',
        },
      },
      required: [TOPIC_PARAM_STRATEGIC_INTENT],
    },
  };
}
