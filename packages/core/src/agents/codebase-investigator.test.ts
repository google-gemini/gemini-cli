/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CodebaseInvestigatorAgent } from './codebase-investigator.js';
import {
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
} from '../tools/tool-names.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { makeFakeConfig } from '../test-utils/config.js';

describe('CodebaseInvestigatorAgent', () => {
  const config = makeFakeConfig();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('should have the correct agent definition', () => {
    const agent = CodebaseInvestigatorAgent(config);
    expect(agent.name).toBe('codebase_investigator');
    expect(agent.displayName).toBe('Codebase Investigator Agent');
    expect(agent.description).toBeDefined();
    const inputSchema =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agent.inputConfig.inputSchema as any;
    expect(inputSchema.properties['objective']).toBeDefined();
    expect(inputSchema.required).toContain('objective');
    expect(agent.outputConfig?.outputName).toBe('report');
    expect(agent.modelConfig?.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(agent.toolConfig?.tools).toEqual([
      LS_TOOL_NAME,
      READ_FILE_TOOL_NAME,
      GLOB_TOOL_NAME,
      GREP_TOOL_NAME,
    ]);
  });

  it('should process output to a formatted JSON string', () => {
    const agent = CodebaseInvestigatorAgent(config);
    const report = {
      SummaryOfFindings: 'summary',
      ExplorationTrace: ['trace'],
      RelevantLocations: [],
    };
    const processed = agent.processOutput?.(report);
    expect(processed).toBe(JSON.stringify(report, null, 2));
  });

  it('should include Windows-specific list command in system prompt when on Windows', () => {
    mockPlatform('win32');
    const agent = CodebaseInvestigatorAgent(config);
    expect(agent.promptConfig.systemPrompt).toContain(
      '`dir /s` (CMD) or `Get-ChildItem -Recurse` (PowerShell)',
    );
  });

  it('should include generic list command in system prompt when on non-Windows', () => {
    mockPlatform('linux');
    const agent = CodebaseInvestigatorAgent(config);
    expect(agent.promptConfig.systemPrompt).toContain('`ls -R`');
  });
});
