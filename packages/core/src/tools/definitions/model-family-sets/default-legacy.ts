/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CoreToolSet } from '../types.js';
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
} from '../base-declarations.js';
import {
  getShellDeclaration,
  getExitPlanModeDeclaration,
  getActivateSkillDeclaration,
} from '../dynamic-declaration-helpers.js';

export const DEFAULT_LEGACY_SET: CoreToolSet = {
  read_file: READ_FILE_BASE,
  write_file: WRITE_FILE_BASE,
  grep_search: GREP_BASE,
  grep_search_ripgrep: RIP_GREP_BASE,
  glob: GLOB_BASE,
  list_directory: LS_BASE,
  run_shell_command: (enableInteractiveShell, enableEfficiency) =>
    getShellDeclaration(enableInteractiveShell, enableEfficiency),
  replace: EDIT_BASE,
  google_web_search: WEB_SEARCH_BASE,
  web_fetch: WEB_FETCH_BASE,
  read_many_files: READ_MANY_FILES_BASE,
  save_memory: MEMORY_BASE,
  write_todos: WRITE_TODOS_BASE,
  get_internal_docs: GET_INTERNAL_DOCS_BASE,
  ask_user: ASK_USER_BASE,
  enter_plan_mode: ENTER_PLAN_MODE_BASE,
  exit_plan_mode: (plansDir) => getExitPlanModeDeclaration(plansDir),
  activate_skill: (skillNames) => getActivateSkillDeclaration(skillNames),
};
