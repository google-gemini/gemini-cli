/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
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
  const agent = CodebaseInvestigatorAgent(config);

  it('should have the correct agent definition', () => {
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
    const report = {
      SummaryOfFindings: 'summary',
      ExplorationTrace: ['trace'],
      RelevantLocations: [],
    };
    const processed = agent.processOutput?.(report);
    expect(processed).toBe(JSON.stringify(report, null, 2));
  });
});
