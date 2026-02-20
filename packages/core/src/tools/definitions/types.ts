/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FunctionDeclaration } from '@google/genai';

/**
 * Supported model families for tool definitions.
 */
export type ToolFamily = 'default-legacy' | 'gemini-3';

/**
 * Defines a tool's identity using a structured declaration.
 */
export interface ToolDefinition {
  /** The base declaration for the tool. */
  base: FunctionDeclaration;

  /**
   * Optional overrides for specific model families or versions.
   */
  overrides?: (modelId: string) => Partial<FunctionDeclaration> | undefined;
}

/**
 * Explicit mapping of all core tools for a specific model family.
 */
export interface CoreToolSet {
  read_file: FunctionDeclaration;
  write_file: FunctionDeclaration;
  grep_search: FunctionDeclaration;
  grep_search_ripgrep: FunctionDeclaration;
  glob: FunctionDeclaration;
  list_directory: FunctionDeclaration;
  run_shell_command: (
    enableInteractiveShell: boolean,
    enableEfficiency: boolean,
  ) => FunctionDeclaration;
  replace: FunctionDeclaration;
  google_web_search: FunctionDeclaration;
  web_fetch: FunctionDeclaration;
  read_many_files: FunctionDeclaration;
  save_memory: FunctionDeclaration;
  write_todos: FunctionDeclaration;
  get_internal_docs: FunctionDeclaration;
  ask_user: FunctionDeclaration;
  enter_plan_mode: FunctionDeclaration;
  exit_plan_mode: (plansDir: string) => FunctionDeclaration;
  activate_skill: (skillNames: string[]) => FunctionDeclaration;
}
