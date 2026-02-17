/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolDefinition, CoreToolSet } from './types.js';
import { isGemini3Model } from '../../config/models.js';
import { DEFAULT_LEGACY_SET } from './model-family-sets/default-legacy.js';
import { GEMINI_3_SET } from './model-family-sets/gemini-3.js';
import {
  READ_FILE_BASE,
  WRITE_FILE_BASE,
  GREP_BASE,
  RIP_GREP_BASE,
  GLOB_BASE,
  LS_BASE,
  EDIT_BASE,
  WEB_SEARCH_BASE,
  WEB_FETCH_BASE,
  READ_MANY_FILES_BASE,
  MEMORY_BASE,
  WRITE_TODOS_BASE,
  GET_INTERNAL_DOCS_BASE,
  ASK_USER_BASE,
  ENTER_PLAN_MODE_BASE,
} from './base-declarations.js';
import {
  getShellDeclaration,
  getExitPlanModeDeclaration,
  getActivateSkillDeclaration,
} from './dynamic-declaration-helpers.js';

// Re-export names for compatibility
export {
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  SHELL_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WRITE_TODOS_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  MEMORY_TOOL_NAME,
  GET_INTERNAL_DOCS_TOOL_NAME,
  ACTIVATE_SKILL_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
} from './base-declarations.js';

// Re-export sets for compatibility
export { DEFAULT_LEGACY_SET } from './model-family-sets/default-legacy.js';
export { GEMINI_3_SET } from './model-family-sets/gemini-3.js';

/**
 * Resolves the appropriate tool set for a given model ID.
 */
export function getToolSet(modelId?: string): CoreToolSet {
  if (modelId && isGemini3Model(modelId)) {
    return GEMINI_3_SET;
  }
  return DEFAULT_LEGACY_SET;
}

// ============================================================================
// TOOL DEFINITIONS (LEGACY EXPORTS)
// ============================================================================

export const READ_FILE_DEFINITION: ToolDefinition = {
  get base() {
    return READ_FILE_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).read_file,
};

export const WRITE_FILE_DEFINITION: ToolDefinition = {
  get base() {
    return WRITE_FILE_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).write_file,
};

export const GREP_DEFINITION: ToolDefinition = {
  get base() {
    return GREP_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).grep_search,
};

export const RIP_GREP_DEFINITION: ToolDefinition = {
  get base() {
    return RIP_GREP_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).grep_search_ripgrep,
};

export const WEB_SEARCH_DEFINITION: ToolDefinition = {
  get base() {
    return WEB_SEARCH_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).google_web_search,
};

export const EDIT_DEFINITION: ToolDefinition = {
  get base() {
    return EDIT_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).replace,
};

export const GLOB_DEFINITION: ToolDefinition = {
  get base() {
    return GLOB_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).glob,
};

export const LS_DEFINITION: ToolDefinition = {
  get base() {
    return LS_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).list_directory,
};

export const WEB_FETCH_DEFINITION: ToolDefinition = {
  get base() {
    return WEB_FETCH_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).web_fetch,
};

export const READ_MANY_FILES_DEFINITION: ToolDefinition = {
  get base() {
    return READ_MANY_FILES_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).read_many_files,
};

export const MEMORY_DEFINITION: ToolDefinition = {
  get base() {
    return MEMORY_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).save_memory,
};

export const WRITE_TODOS_DEFINITION: ToolDefinition = {
  get base() {
    return WRITE_TODOS_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).write_todos,
};

export const GET_INTERNAL_DOCS_DEFINITION: ToolDefinition = {
  get base() {
    return GET_INTERNAL_DOCS_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).get_internal_docs,
};

export const ASK_USER_DEFINITION: ToolDefinition = {
  get base() {
    return ASK_USER_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).ask_user,
};

export const ENTER_PLAN_MODE_DEFINITION: ToolDefinition = {
  get base() {
    return ENTER_PLAN_MODE_BASE;
  },
  overrides: (modelId) => getToolSet(modelId).enter_plan_mode,
};

// ============================================================================
// DYNAMIC TOOL DEFINITIONS (LEGACY EXPORTS)
// ============================================================================

export {
  getShellToolDescription,
  getCommandDescription,
} from './dynamic-declaration-helpers.js';

export function getShellDefinition(
  enableInteractiveShell: boolean,
  enableEfficiency: boolean,
): ToolDefinition {
  return {
    base: getShellDeclaration(enableInteractiveShell, enableEfficiency),
    overrides: (modelId) =>
      getToolSet(modelId).run_shell_command(
        enableInteractiveShell,
        enableEfficiency,
      ),
  };
}

export function getExitPlanModeDefinition(plansDir: string): ToolDefinition {
  return {
    base: getExitPlanModeDeclaration(plansDir),
    overrides: (modelId) => getToolSet(modelId).exit_plan_mode(plansDir),
  };
}

export function getActivateSkillDefinition(
  skillNames: string[],
): ToolDefinition {
  return {
    base: getActivateSkillDeclaration(skillNames),
    overrides: (modelId) => getToolSet(modelId).activate_skill(skillNames),
  };
}
