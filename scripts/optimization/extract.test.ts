/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { runExtraction } from './extract.js';

vi.mock('node:fs');

describe('extraction script', () => {
  const mockManifest = {
    data_inventory: {
      optimization_targets: {
        snippets: ['renderCoreMandates'],
      },
      tools: {
        read_file: {},
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (typeof path !== 'string') return '';
      if (path.includes('manifest.json')) return JSON.stringify(mockManifest);

      // Mock snippets.ts
      if (path.includes('snippets.ts')) {
        return `
          export function renderCoreMandates(options: any): string {
            const foo = "Ignore me";
            return \`# Core Mandate Instruction \${USER_VAR}\`.trim();
          }
        `;
      }

      // Mock gemini-3.ts
      if (path.includes('gemini-3.ts')) {
        return `
  read_file: {
    description: 'Read file description.',
  },
`;
      }

      // Mock dynamic helpers
      if (path.includes('dynamic-declaration-helpers.ts')) {
        return `
          return \`This tool executes a given shell command as \\\`bash -c <command>\\\`. \${backgroundInstructions}\`;
          name: EXIT_PLAN_MODE_TOOL_NAME,
          description: 'Exit Plan Mode.',
          name: ACTIVATE_SKILL_TOOL_NAME,
          description: \`Activate skill.\`,
        `;
      }
      return '';
    });
  });

  it('should extract snippets correctly (Step 1)', async () => {
    const targets = await runExtraction();
    const snippet = targets.find((t) => t.id === 'snippets:renderCoreMandates');
    expect(snippet).toBeDefined();
    expect(snippet?.originalText).toBe(
      '# Core Mandate Instruction ${USER_VAR}',
    );
    expect(snippet?.maskedText).toContain('[[GCLI_VAR_0]]');
  });

  it('should extract tools correctly (Step 2)', async () => {
    const targets = await runExtraction();
    const tool = targets.find((t) => t.id === 'gemini3:read_file:description');
    expect(tool).toBeDefined();
    expect(tool?.originalText).toBe('Read file description.');
  });

  it('should extract dynamic helpers correctly (Step 3)', async () => {
    const targets = await runExtraction();
    const shell = targets.find((t) => t.id === 'shell:darwin:description');
    expect(shell).toBeDefined();
    expect(shell?.maskedText).toContain('[[GCLI_VAR_0]]');

    const exitPlan = targets.find((t) => t.id === 'exit_plan_mode:description');
    expect(exitPlan?.originalText).toBe('Exit Plan Mode.');
  });

  it('should write targets.json to the correct directory', async () => {
    await runExtraction();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('targets.json'),
      expect.any(String),
    );
  });
});
