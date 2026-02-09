/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { Config } from '../config/config.js';
import { GEMINI_DIR } from '../utils/paths.js';
import { ApprovalMode } from '../policy/types.js';
import * as snippets from './snippets.js';
import * as legacySnippets from './snippets.legacy.js';
import {
  resolvePathFromEnv,
  applySubstitutions,
  isSectionEnabled,
  type ResolvedPath,
} from './utils.js';
import { CodebaseInvestigatorAgent } from '../agents/codebase-investigator.js';
import { isGitRepository } from '../utils/gitUtils.js';
import {
  PLAN_MODE_TOOLS,
  WRITE_TODOS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
} from '../tools/tool-names.js';
import { resolveModel, isPreviewModel } from '../config/models.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';

/**
 * Orchestrates prompt generation by gathering context and building options.
 */
export class PromptProvider {
  /**
   * Generates the core system prompt.
   */
  getCoreSystemPrompt(
    config: Config,
    userMemory?: string,
    interactiveOverride?: boolean,
  ): string {
    const systemMdResolution = resolvePathFromEnv(
      process.env['GEMINI_SYSTEM_MD'],
    );

    const interactiveMode = interactiveOverride ?? config.isInteractive();
    const approvalMode = config.getApprovalMode?.() ?? ApprovalMode.DEFAULT;
    const isPlanMode = approvalMode === ApprovalMode.PLAN;
    const skills = config.getSkillManager().getSkills();
    const toolNames = config.getToolRegistry().getAllToolNames();
    const enabledToolNames = new Set(toolNames);
    const approvedPlanPath = config.getApprovedPlanPath();

    const desiredModel = resolveModel(config.getActiveModel());
    const isGemini3 = isPreviewModel(desiredModel);
    const activeSnippets = isGemini3 ? snippets : legacySnippets;

    // --- Context Gathering ---
    let planModeToolsList = PLAN_MODE_TOOLS.filter((t) =>
      enabledToolNames.has(t),
    )
      .map((t) => `- \`${t}\``)
      .join('\n');

    // Add read-only MCP tools to the list
    if (isPlanMode) {
      const allTools = config.getToolRegistry().getAllTools();
      const readOnlyMcpTools = allTools.filter(
        (t): t is DiscoveredMCPTool =>
          t instanceof DiscoveredMCPTool && !!t.isReadOnly,
      );
      if (readOnlyMcpTools.length > 0) {
        const mcpToolsList = readOnlyMcpTools
          .map((t) => `- \`${t.name}\` (${t.serverName})`)
          .join('\n');
        planModeToolsList += `\n${mcpToolsList}`;
      }
    }

    let basePrompt: string;

    // --- Template File Override ---
    if (systemMdResolution.value && !systemMdResolution.isDisabled) {
      let systemMdPath = path.resolve(path.join(GEMINI_DIR, 'system.md'));
      if (!systemMdResolution.isSwitch) {
        systemMdPath = systemMdResolution.value;
      }
      if (!fs.existsSync(systemMdPath)) {
        throw new Error(`missing system prompt file '${systemMdPath}'`);
      }
      basePrompt = fs.readFileSync(systemMdPath, 'utf8');
      const skillsPrompt = activeSnippets.renderAgentSkills(
        skills.map((s) => ({
          name: s.name,
          description: s.description,
          location: s.location,
        })),
      );
      basePrompt = applySubstitutions(
        basePrompt,
        config,
        skillsPrompt,
        isGemini3,
      );
    } else {
      // --- Standard Composition ---
      const options: snippets.SystemPromptOptions = {
        preamble: this.withSection('preamble', () => ({
          interactive: interactiveMode,
        })),
        coreMandates: this.withSection('coreMandates', () => ({
          interactive: interactiveMode,
          isGemini3,
          hasSkills: skills.length > 0,
        })),
        subAgents: this.withSection('agentContexts', () =>
          config
            .getAgentRegistry()
            .getAllDefinitions()
            .map((d) => ({
              name: d.displayName || d.name,
              description: d.description,
            })),
        ),
        agentSkills: this.withSection(
          'agentSkills',
          () =>
            skills.map((s) => ({
              name: s.name,
              description: s.description,
              location: s.location,
            })),
          skills.length > 0,
        ),
        hookContext: isSectionEnabled('hookContext') || undefined,
        primaryWorkflows: this.withSection(
          'primaryWorkflows',
          () => ({
            interactive: interactiveMode,
            enableCodebaseInvestigator: enabledToolNames.has(
              CodebaseInvestigatorAgent.name,
            ),
            enableWriteTodosTool: enabledToolNames.has(WRITE_TODOS_TOOL_NAME),
            enableEnterPlanModeTool: enabledToolNames.has(
              ENTER_PLAN_MODE_TOOL_NAME,
            ),
            approvedPlan: approvedPlanPath
              ? { path: approvedPlanPath }
              : undefined,
          }),
          !isPlanMode,
        ),
        planningWorkflow: this.withSection(
          'planningWorkflow',
          () => ({
            planModeToolsList,
            plansDir: config.storage.getProjectTempPlansDir(),
            approvedPlanPath: config.getApprovedPlanPath(),
          }),
          isPlanMode,
        ),
        operationalGuidelines: this.withSection(
          'operationalGuidelines',
          () => ({
            interactive: interactiveMode,
            isGemini3,
            enableShellEfficiency: config.getEnableShellOutputEfficiency(),
            interactiveShellEnabled: config.isInteractiveShellEnabled(),
          }),
        ),
        sandbox: this.withSection('sandbox', () => getSandboxMode()),
        gitRepo: this.withSection(
          'git',
          () => ({ interactive: interactiveMode }),
          isGitRepository(process.cwd()) ? true : false,
        ),
        finalReminder: this.withSection('finalReminder', () => ({
          readFileToolName: READ_FILE_TOOL_NAME,
        })),
      };

      basePrompt = activeSnippets.getCoreSystemPrompt(options);
    }

    // --- Finalization (Shell) ---
    const finalPrompt = activeSnippets.renderFinalShell(basePrompt, userMemory);

    // Sanitize erratic newlines from composition
    const sanitizedPrompt = finalPrompt.replace(/\n{3,}/g, '\n\n');

    // Write back to file if requested
    this.maybeWriteSystemMd(
      sanitizedPrompt,
      systemMdResolution,
      path.resolve(path.join(GEMINI_DIR, 'system.md')),
    );

    return sanitizedPrompt;
  }

  getCompressionPrompt(config: Config): string {
    const desiredModel = resolveModel(config.getActiveModel());
    const isGemini3 = isPreviewModel(desiredModel);
    const activeSnippets = isGemini3 ? snippets : legacySnippets;
    return activeSnippets.getCompressionPrompt();
  }

  private withSection<T>(
    key: string,
    factory: () => T,
    guard: boolean = true,
  ): T | undefined {
    return guard && isSectionEnabled(key) ? factory() : undefined;
  }

  private maybeWriteSystemMd(
    basePrompt: string,
    resolution: ResolvedPath,
    defaultPath: string,
  ): void {
    const writeSystemMdResolution = resolvePathFromEnv(
      process.env['GEMINI_WRITE_SYSTEM_MD'],
    );
    if (writeSystemMdResolution.value && !writeSystemMdResolution.isDisabled) {
      const writePath = writeSystemMdResolution.isSwitch
        ? defaultPath
        : writeSystemMdResolution.value;
      fs.mkdirSync(path.dirname(writePath), { recursive: true });
      fs.writeFileSync(writePath, basePrompt);
    }
  }
}

// --- Internal Context Helpers ---

function getSandboxMode(): snippets.SandboxMode {
  if (process.env['SANDBOX'] === 'sandbox-exec') return 'macos-seatbelt';
  if (process.env['SANDBOX']) return 'generic';
  return 'outside';
}
