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
import { GEMINI_MODEL_ALIAS_PRO } from '../config/models.js';

describe('CodebaseInvestigatorAgent', () => {
  it('should have the correct agent definition', () => {
    expect(CodebaseInvestigatorAgent.name).toBe('codebase_investigator');
    expect(CodebaseInvestigatorAgent.displayName).toBe(
      'Codebase Investigator Agent',
    );
    expect(CodebaseInvestigatorAgent.description).toBeDefined();
    expect(CodebaseInvestigatorAgent.outputConfig?.outputName).toBe('report');
    expect(CodebaseInvestigatorAgent.modelConfig?.model).toBe(
      GEMINI_MODEL_ALIAS_PRO,
    );
    expect(CodebaseInvestigatorAgent.toolConfig?.tools).toEqual([
      LS_TOOL_NAME,
      READ_FILE_TOOL_NAME,
      GLOB_TOOL_NAME,
      GREP_TOOL_NAME,
    ]);
  });

  it('should use new JSONSchema7 format for inputConfig', () => {
    expect('inputSchema' in CodebaseInvestigatorAgent.inputConfig).toBe(true);
    if ('inputSchema' in CodebaseInvestigatorAgent.inputConfig) {
      expect(CodebaseInvestigatorAgent.inputConfig.inputSchema.type).toBe(
        'object',
      );
      expect(
        CodebaseInvestigatorAgent.inputConfig.inputSchema.properties,
      ).toHaveProperty('objective');
      expect(
        CodebaseInvestigatorAgent.inputConfig.inputSchema.required,
      ).toContain('objective');
    }
  });

  it('should process output to a formatted JSON string', () => {
    const report = {
      SummaryOfFindings: 'summary',
      ExplorationTrace: ['trace'],
      RelevantLocations: [],
    };
    const processed = CodebaseInvestigatorAgent.processOutput?.(report);
    expect(processed).toBe(JSON.stringify(report, null, 2));
  });
});
