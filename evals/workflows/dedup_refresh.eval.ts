/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from '../test-helper.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

// Read the workflow file to extract the prompt and settings
const workflowPath = path.join(
  process.cwd(),
  '.github/workflows/gemini-scheduled-issue-dedup.yml',
);
const workflowContent = await fs.readFile(workflowPath, 'utf8');

const workflowData = yaml.load(workflowContent) as any;
const geminiStep = workflowData.jobs?.['refresh-embeddings']?.steps?.find(
  (step: any) => step.id === 'gemini_refresh_embeddings',
);

const REFRESH_PROMPT_TEMPLATE = geminiStep?.with?.prompt;
const ORIGINAL_SETTINGS = JSON.parse(geminiStep?.with?.settings || '{}');

if (!REFRESH_PROMPT_TEMPLATE) {
  throw new Error('Could not extract prompt from dedup refresh workflow.');
}

const mockMcpPath = path.join(process.cwd(), 'evals/mocks/dedup_mcp.ts');

const createPrompt = () => {
  return REFRESH_PROMPT_TEMPLATE.replace(
    /\${{ github\.repository }}/g,
    'google-gemini/gemini-cli',
  );
};

const tsxPath = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');

const REFRESH_SETTINGS = {
  ...ORIGINAL_SETTINGS,
  mcpServers: {
    issue_deduplication: {
      command: tsxPath,
      args: [mockMcpPath],
    },
  },
};
if (REFRESH_SETTINGS.telemetry) {
  delete REFRESH_SETTINGS.telemetry;
}

describe('dedup_refresh_agent', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should call refresh tool',
    prompt: ['--output-format', 'json', '--prompt', createPrompt()],
    approvalMode: 'yolo',
    params: {
      settings: REFRESH_SETTINGS,
    },
    assert: async (rig: any, result) => {
      // result is the JSON output
      const output = JSON.parse(result);
      expect(output.stats).toBeDefined();

      const toolStats = output.stats.tools.byName;
      expect(toolStats.refresh).toBeDefined();
      expect(toolStats.refresh.count).toBe(1);
      expect(toolStats.refresh.success).toBe(1);

      // We still check telemetry for deep arg inspection if needed,
      // but stats verify the high-level goal.
      const toolLogs = rig.readToolLogs();
      const refreshCall = toolLogs.find(
        (l: any) => l.toolRequest.name === 'refresh',
      );
      expect(refreshCall).toBeDefined();
    },
  });
});
