/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum LlmRole {
  MAIN = 'main',
  SUBAGENT = 'subagent',
  SUBAGENT_CODEBASE_INVESTIGATOR = 'subagent_codebase_investigator',
  UTILITY_TOOL = 'utility_tool',
  UTILITY_COMPRESSOR = 'utility_compressor',
  UTILITY_SUMMARIZER = 'utility_summarizer',
  UTILITY_ROUTER = 'utility_router',
  UTILITY_LOOP_DETECTOR = 'utility_loop_detector',
  UTILITY_NEXT_SPEAKER = 'utility_next_speaker',
  UTILITY_EDIT_CORRECTOR = 'utility_edit_corrector',
  UTILITY_AUTOCOMPLETE = 'utility_autocomplete',
}
