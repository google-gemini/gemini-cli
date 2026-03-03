/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:os BEFORE importing coreTools to ensure it uses the mock
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    platform: () => 'linux',
  };
});

import { resolveToolDeclaration } from './resolver.js';
import {
  READ_FILE_DEFINITION,
  WRITE_FILE_DEFINITION,
  GREP_DEFINITION,
  RIP_GREP_DEFINITION,
  GLOB_DEFINITION,
  LS_DEFINITION,
  getShellDefinition,
  EDIT_DEFINITION,
  WEB_SEARCH_DEFINITION,
  WEB_FETCH_DEFINITION,
  READ_MANY_FILES_DEFINITION,
  MEMORY_DEFINITION,
  WRITE_TODOS_DEFINITION,
  GET_INTERNAL_DOCS_DEFINITION,
  ASK_USER_DEFINITION,
  ENTER_PLAN_MODE_DEFINITION,
  getExitPlanModeDefinition,
  getActivateSkillDefinition,
} from './coreTools.js';

describe('coreTools snapshots for specific models', () => {
  const mockPlatform = (platform: string) => {
    vi.stubGlobal(
      'process',
      Object.create(process, {
        platform: {
          get: () => platform,
        },
      }),
    );
  };

  beforeEach(() => {
    vi.resetAllMocks();
    // Stub process.platform to 'linux' by default for deterministic snapshots across OSes
    mockPlatform('linux');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const modelIds = ['gemini-2.5-pro', 'gemini-3-pro-preview'];
  const tools = [
    { name: 'read_file', definition: READ_FILE_DEFINITION },
    { name: 'write_file', definition: WRITE_FILE_DEFINITION },
    { name: 'grep_search', definition: GREP_DEFINITION },
    { name: 'grep_search_ripgrep', definition: RIP_GREP_DEFINITION },
    { name: 'glob', definition: GLOB_DEFINITION },
    { name: 'list_directory', definition: LS_DEFINITION },
    {
      name: 'run_shell_command',
      definition: getShellDefinition(true, true),
    },
    { name: 'replace', definition: EDIT_DEFINITION },
    { name: 'google_web_search', definition: WEB_SEARCH_DEFINITION },
    { name: 'web_fetch', definition: WEB_FETCH_DEFINITION },
    { name: 'read_many_files', definition: READ_MANY_FILES_DEFINITION },
    { name: 'save_memory', definition: MEMORY_DEFINITION },
    { name: 'write_todos', definition: WRITE_TODOS_DEFINITION },
    { name: 'get_internal_docs', definition: GET_INTERNAL_DOCS_DEFINITION },
    { name: 'ask_user', definition: ASK_USER_DEFINITION },
    { name: 'enter_plan_mode', definition: ENTER_PLAN_MODE_DEFINITION },
    {
      name: 'exit_plan_mode',
      definition: getExitPlanModeDefinition('/mock/plans'),
    },
    {
      name: 'activate_skill',
      definition: getActivateSkillDefinition(['skill1', 'skill2']),
    },
    {
      name: 'activate_skill_empty',
      definition: getActivateSkillDefinition([]),
    },
    {
      name: 'activate_skill_single',
      definition: getActivateSkillDefinition(['skill1']),
    },
  ];

  for (const modelId of modelIds) {
    describe(`Model: ${modelId}`, () => {
      for (const tool of tools) {
        it(`snapshot for tool: ${tool.name}`, () => {
          const resolved = resolveToolDeclaration(tool.definition, modelId);
          expect(resolved).toMatchSnapshot();
        });
      }
    });
  }
});
