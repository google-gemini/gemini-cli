/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import {
  EDIT_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  MEMORY_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  SHELL_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  WRITE_TODOS_TOOL_NAME,
  DELEGATE_TO_AGENT_TOOL_NAME,
  ACTIVATE_SKILL_TOOL_NAME,
} from '../tools/tool-names.js';
import process from 'node:process';
import { isGitRepository } from '../utils/gitUtils.js';
import { CodebaseInvestigatorAgent } from '../agents/codebase-investigator.js';
import type { Config } from '../config/config.js';
import { GEMINI_DIR, homedir } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';
import { WriteTodosTool } from '../tools/write-todos.js';
import { resolveModel, isPreviewModel } from '../config/models.js';

import { MANAGER_PROMPT } from './prompts/manager.js';
import { COMPRESSION_PROMPT } from './prompts/compression.js';
import { CORE_MANDATES } from './prompts/core-mandates.js';
import {
  WORKFLOWS_BASE,
  WORKFLOWS_CI,
  WORKFLOWS_TODO,
  WORKFLOW_SUFFIX,
} from './prompts/workflows.js';
import {
  OPERATIONAL_GUIDELINES_PREFIX,
  SHELL_EFFICIENCY_GUIDELINES,
  TONE_AND_STYLE,
  SAFETY_AND_TOOLS,
} from './prompts/guidelines.js';
import { FINAL_REMINDER } from './prompts/final-reminder.js';

export function resolvePathFromEnv(envVar?: string): {
  isSwitch: boolean;
  value: string | null;
  isDisabled: boolean;
} {
  const trimmedEnvVar = envVar?.trim();
  if (!trimmedEnvVar) {
    return { isSwitch: false, value: null, isDisabled: false };
  }
  const lowerEnvVar = trimmedEnvVar.toLowerCase();
  if (['0', 'false', '1', 'true'].includes(lowerEnvVar)) {
    const isDisabled = ['0', 'false'].includes(lowerEnvVar);
    return { isSwitch: true, value: lowerEnvVar, isDisabled };
  }
  let customPath = trimmedEnvVar;
  if (customPath.startsWith('~/') || customPath === '~') {
    try {
      const home = homedir();
      if (customPath === '~') {
        customPath = home;
      } else {
        customPath = path.join(home, customPath.slice(2));
      }
    } catch (error) {
      debugLogger.warn(
        `Could not resolve home directory for path: ${trimmedEnvVar}`,
        error,
      );
      return { isSwitch: false, value: null, isDisabled: false };
    }
  }
  return {
    isSwitch: false,
    value: path.resolve(customPath),
    isDisabled: false,
  };
}

function injectTools(text: string): string {
  return text
    .replaceAll('GREP_TOOL', GREP_TOOL_NAME)
    .replaceAll('GLOB_TOOL', GLOB_TOOL_NAME)
    .replaceAll('READ_FILE_TOOL', READ_FILE_TOOL_NAME)
    .replaceAll('EDIT_TOOL', EDIT_TOOL_NAME)
    .replaceAll('WRITE_FILE_TOOL', WRITE_FILE_TOOL_NAME)
    .replaceAll('SHELL_TOOL', SHELL_TOOL_NAME)
    .replaceAll('TODO_TOOL', WRITE_TODOS_TOOL_NAME)
    .replaceAll('DELEGATE_TOOL', DELEGATE_TO_AGENT_TOOL_NAME)
    .replaceAll('MEMORY_TOOL', MEMORY_TOOL_NAME)
    .replaceAll('INVESTIGATOR_AGENT', CodebaseInvestigatorAgent.name);
}

export function getCoreSystemPrompt(
  config: Config,
  userMemory?: string,
): string {
  const systemMdResolution = resolvePathFromEnv(
    process.env['GEMINI_SYSTEM_MD'],
  );
  let systemMdEnabled = false;
  let systemMdPath = path.resolve(path.join(GEMINI_DIR, 'system.md'));

  if (config.isManagerMode()) {
    return (
      MANAGER_PROMPT +
      (userMemory && userMemory.trim().length > 0
        ? `

---

${userMemory.trim()}`
        : '')
    );
  }

  if (systemMdResolution.value && !systemMdResolution.isDisabled) {
    systemMdEnabled = true;
    if (!systemMdResolution.isSwitch) {
      systemMdPath = systemMdResolution.value;
    }
    if (!fs.existsSync(systemMdPath)) {
      throw new Error(`missing system prompt file '${systemMdPath}'`);
    }
  }

  if (systemMdEnabled) {
    const basePrompt = fs.readFileSync(systemMdPath, 'utf8');
    const memorySuffix =
      userMemory && userMemory.trim().length > 0
        ? `

---

${userMemory.trim()}`
        : '';
    return basePrompt.trim() + memorySuffix;
  }

  const desiredModel = resolveModel(
    config.getActiveModel(),
    config.getPreviewFeatures(),
  );
  const isGemini3 = isPreviewModel(desiredModel);
  const interactiveMode = config.isInteractive();

  const mandatesVariant = isGemini3
    ? `
- **Explain Before Acting:** Never call tools in silence. You MUST provide a concise, one-sentence explanation of your intent or strategy immediately before executing tool calls. This is essential for transparency, especially when confirming a request or answering a question. Silence is only acceptable for repetitive, low-level discovery operations (e.g., sequential file reads) where narration would be noisy.`
    : ``;

  const enableCodebaseInvestigator = config
    .getToolRegistry()
    .getAllToolNames()
    .includes(CodebaseInvestigatorAgent.name);
  const enableWriteTodosTool = config
    .getToolRegistry()
    .getAllToolNames()
    .includes(WriteTodosTool.Name);

  const skills = config.getSkillManager().getSkills();
  let skillsPrompt = '';
  if (skills.length > 0) {
    const skillsXml = skills
      .map(
        (skill) => `  <skill>
    <name>${skill.name}</name>
    <description>${skill.description}</description>
    <location>${skill.location}</location>
  </skill>`,
      )
      .join('\n');
    skillsPrompt = `
# Available Agent Skills

You have access to the following specialized skills. To activate a skill and receive its detailed instructions, you can call the \`${ACTIVATE_SKILL_TOOL_NAME}\` tool with the skill's name.

<available_skills>
${skillsXml}
</available_skills>
`;
  }

  const preamble = `You are ${interactiveMode ? 'an interactive ' : 'a non-interactive '}CLI agent specializing in software engineering tasks. Your primary goal is to help users safely and efficiently, adhering strictly to the following instructions and utilizing your available tools.`;

  const skillGuidance =
    skills.length > 0
      ? `
- **Skill Guidance:** Once a skill is activated via \`${ACTIVATE_SKILL_TOOL_NAME}\`, its instructions and resources are returned wrapped in \`<activated_skill>\` tags. You MUST treat the content within \`<instructions>\` as expert procedural guidance, prioritizing these specialized rules and workflows over your general defaults for the duration of the task. You may utilize any listed \`<available_resources>\` as needed. Follow this expert guidance strictly while continuing to uphold your core safety and security standards.`
      : '';

  const interactiveMandate = interactiveMode
    ? `
- **Confirm Ambiguity/Expansion:** Do not take significant actions beyond the clear scope of the request without confirming with the user. If asked *how* to do something, explain first, don't just do it.`
    : `
- **Handle Ambiguity/Expansion:** Do not take significant actions beyond the clear scope of the request.
- **Continue the work** You are not to interact with the user. Do your best to complete the task at hand, using your best judgement and avoid asking user for any additional information.`;

  const coreMandates =
    CORE_MANDATES +
    skillGuidance +
    mandatesVariant +
    interactiveMandate +
    `

${config.getAgentRegistry().getDirectoryContext()}${skillsPrompt}`;

  let workflows = '';
  if (enableCodebaseInvestigator && enableWriteTodosTool) {
    workflows = injectTools(WORKFLOWS_CI); // CI version already includes Understand & Strategize
    // we use CI+TODO by substituting the Plan part in workflows.js?
    // Actually workflows.js has separate constants.
  } else if (enableCodebaseInvestigator) {
    workflows = injectTools(WORKFLOWS_CI);
  } else {
    workflows = injectTools(WORKFLOWS_BASE);
  }

  // Workflows CI has Plan as point 2. WORKFLOWS_TODO is just a replacement for point 2.
  if (enableWriteTodosTool) {
    workflows = workflows.replace(
      /2\. \*\*Plan:\*\* .*solution\./s,
      injectTools(WORKFLOWS_TODO),
    );
  }

  const workflowSuffix =
    injectTools(WORKFLOW_SUFFIX) +
    (interactiveMode
      ? `3. **User Approval:** Obtain user approval for the proposed plan.
4. **Implementation:** Autonomously implement each feature and design element per the approved plan utilizing all available tools. When starting ensure you scaffold the application using '${SHELL_TOOL_NAME}' for commands like 'npm init', 'npx create-react-app'. Aim for full scope completion. Proactively create or source necessary placeholder assets (e.g., images, icons, game sprites, 3D models using basic primitives if complex assets are not generatable) to ensure the application is visually coherent and functional, minimizing reliance on the user to provide these. If the model can generate simple assets (e.g., a uniformly colored square sprite, a simple 3D cube), it should do so. Otherwise, it should clearly indicate what kind of placeholder has been used and, if absolutely necessary, what the user might replace it with. Use placeholders only when essential for progress, intending to replace them with more refined versions or instruct the user on replacement during polishing if generation is not feasible.
5. **Verify:** Review work against the original request, the approved plan. Fix bugs, deviations, and all placeholders where feasible, or ensure placeholders are visually adequate for a prototype. Ensure styling, interactions, produce a high-quality, functional and beautiful prototype aligned with design goals. Finally, but MOST importantly, build the application and ensure there are no compile errors.
6. **Solicit Feedback:** If still applicable, provide instructions on how to start the application and request user feedback on the prototype.`
      : `3. **Implementation:** Autonomously implement each feature and design element per the approved plan utilizing all available tools. When starting ensure you scaffold the application using '${SHELL_TOOL_NAME}' for commands like 'npm init', 'npx create-react-app'. Aim for full scope completion. Proactively create or source necessary placeholder assets (e.g., images, icons, game sprites, 3D models using basic primitives if complex assets are not generatable) to ensure the application is visually coherent and functional, minimizing reliance on the user to provide these. If the model can generate simple assets (e.g., a uniformly colored square sprite, a simple 3D cube), it should do so. Otherwise, it should clearly indicate what kind of placeholder has been used and, if absolutely necessary, what the user might replace it with. Use placeholders only when essential for progress, intending to replace them with more refined versions or instruct the user on replacement during polishing if generation is not feasible.
4. **Verify:** Review work against the original request, the approved plan. Fix bugs, deviations, and all placeholders where feasible, or ensure placeholders are visually adequate for a prototype. Ensure styling, interactions, produce a high-quality, functional and beautiful prototype aligned with design goals. Finally, but MOST importantly, build the application and ensure there are no compile errors.`);

  const shellEfficiency = config.getEnableShellOutputEfficiency()
    ? injectTools(SHELL_EFFICIENCY_GUIDELINES)
    : '';
  const operationalGuidelines =
    OPERATIONAL_GUIDELINES_PREFIX +
    shellEfficiency +
    TONE_AND_STYLE +
    injectTools(SAFETY_AND_TOOLS);

  const isSandboxExec = process.env['SANDBOX'] === 'sandbox-exec';
  const isGenericSandbox = !!process.env['SANDBOX'];
  const sandbox = isSandboxExec
    ? `
# macOS Seatbelt
You are running under macos seatbelt with limited access to files outside the project directory or system temp directory, and with limited access to host system resources such as ports. If you encounter failures that could be due to macOS Seatbelt, also explain why you think it could be due to macOS Seatbelt, and how the user may need to adjust their Seatbelt profile.
`
    : isGenericSandbox
      ? `
# Sandbox
You are running in a sandbox container with limited access to files outside the project directory or system temp directory, and with limited access to host system resources such as ports. If you encounter failures that could be due to sandboxing, when you report the error to the user, also explain why you think it could be due to sandboxing, and how the user may need to adjust their sandbox configuration.
`
      : `
# Outside of Sandbox
You are running outside of a sandbox container, directly on the user's system. For critical commands that are particularly likely to modify the user's system outside of the project directory or system temp directory, as you explain the command to the user (per the Explain Critical Commands rule above), also remind the user to consider enabling sandboxing.
`;

  const git = isGitRepository(process.cwd())
    ? `
# Git Repository
- The current working (project) directory is being managed by a git repository.
- When asked to commit changes or prepare a commit, always start by gathering information using shell commands:
  - \`git status\` to ensure that all relevant files are tracked and staged, using \`git add ...\` as needed.
  - \`git diff HEAD\` to review all changes (including unstaged changes) to tracked files in work tree since last commit.
    - \`git diff --staged\` to review only staged changes when a partial commit makes sense or was requested by the user.
  - \`git log -n 3\` to review recent commit messages and match their style (verbosity, formatting, signature line, etc.)
- Combine shell commands whenever possible to save time/steps, e.g. \`git status && git diff HEAD && git log -n 3\`.
- Always propose a draft commit message. Never just ask the user to give you the full commit message.
- Prefer commit messages that are clear, concise, and focused more on "why" and less on "what".
- After each commit, confirm that it was successful by running \`git status\`.
- If a commit fails, never attempt to work around the issues without being asked to do so.
- Never push changes to a remote repository without being asked explicitly by the user.
`
    : '';

  const basePrompt = [
    preamble,
    coreMandates,
    workflows,
    workflowSuffix,
    operationalGuidelines,
    sandbox,
    git,
    injectTools(FINAL_REMINDER),
  ].join('\n');

  const writeSystemMdResolution = resolvePathFromEnv(
    process.env['GEMINI_WRITE_SYSTEM_MD'],
  );
  if (writeSystemMdResolution.value && !writeSystemMdResolution.isDisabled) {
    const writePath = writeSystemMdResolution.isSwitch
      ? systemMdPath
      : writeSystemMdResolution.value;
    fs.mkdirSync(path.dirname(writePath), { recursive: true });
    fs.writeFileSync(writePath, basePrompt);
  }

  const memorySuffix =
    userMemory && userMemory.trim().length > 0
      ? `

---

${userMemory.trim()}`
      : '';
  return basePrompt.trim() + memorySuffix;
}

export function getCompressionPrompt(): string {
  return COMPRESSION_PROMPT;
}
