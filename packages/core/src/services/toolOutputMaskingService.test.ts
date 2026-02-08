/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ToolOutputMaskingService,
  MASKING_INDICATOR_TAG,
} from './toolOutputMaskingService.js';
import {
  SHELL_TOOL_NAME,
  ACTIVATE_SKILL_TOOL_NAME,
  MEMORY_TOOL_NAME,
} from '../tools/tool-names.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import type { Config } from '../config/config.js';
import type { Content, Part } from '@google/genai';

vi.mock('../utils/tokenCalculation.js', () => ({
  estimateTokenCountSync: vi.fn(),
}));

describe('ToolOutputMaskingService', () => {
  let service: ToolOutputMaskingService;
  let mockConfig: Config;
  let testTempDir: string;

  const mockedEstimateTokenCountSync = vi.mocked(estimateTokenCountSync);

  beforeEach(async () => {
    testTempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'tool-masking-test-'),
    );

    service = new ToolOutputMaskingService();
    mockConfig = {
      storage: {
        getHistoryDir: () => path.join(testTempDir, 'history'),
        getProjectTempDir: () => testTempDir,
      },
      getSessionId: () => 'mock-session',
      getUsageStatisticsEnabled: () => false,
      getToolOutputMaskingEnabled: () => true,
      getToolOutputMaskingConfig: async () => ({
        enabled: true,
        toolProtectionThreshold: 50000,
        minPrunableTokensThreshold: 30000,
        protectLatestTurn: true,
      }),
    } as unknown as Config;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (testTempDir) {
      await fs.promises.rm(testTempDir, { recursive: true, force: true });
    }
  });

  it('should respect remote configuration overrides', async () => {
    mockConfig.getToolOutputMaskingConfig = async () => ({
      enabled: true,
      toolProtectionThreshold: 100, // Very low threshold
      minPrunableTokensThreshold: 50,
      protectLatestTurn: false,
    });

    const history: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'test_tool',
              response: { output: 'A'.repeat(200) },
            },
          },
        ],
      },
    ];

    mockedEstimateTokenCountSync.mockImplementation((parts) => {
      const resp = parts[0].functionResponse?.response as Record<
        string,
        unknown
      >;
      const content = (resp?.['output'] as string) ?? JSON.stringify(resp);
      return content.includes(MASKING_INDICATOR_TAG) ? 10 : 200;
    });

    const result = await service.mask(history, mockConfig);

    // With low thresholds and protectLatestTurn=false, it should mask even the latest turn
    expect(result.maskedCount).toBe(1);
    expect(result.tokensSaved).toBeGreaterThan(0);
  });

  it('should not mask if total tool tokens are below protection threshold', async () => {
    const history: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'test_tool',
              response: { output: 'small output' },
            },
          },
        ],
      },
    ];

    mockedEstimateTokenCountSync.mockReturnValue(100);

    const result = await service.mask(history, mockConfig);

    expect(result.maskedCount).toBe(0);
    expect(result.newHistory).toEqual(history);
  });

  const getToolResponse = (part: Part | undefined): string => {
    const resp = part?.functionResponse?.response as
      | { output: string }
      | undefined;
    return resp?.output ?? (resp as unknown as string) ?? '';
  };

  it('should protect the latest turn and mask older outputs beyond 50k window if total > 30k', async () => {
    // History:
    // Turn 1: 60k (Oldest)
    // Turn 2: 20k
    // Turn 3: 10k (Latest) - Protected because PROTECT_LATEST_TURN is true
    const history: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 't1',
              response: { output: 'A'.repeat(60000) },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 't2',
              response: { output: 'B'.repeat(20000) },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 't3',
              response: { output: 'C'.repeat(10000) },
            },
          },
        ],
      },
    ];

    mockedEstimateTokenCountSync.mockImplementation((parts: Part[]) => {
      const toolName = parts[0].functionResponse?.name;
      const resp = parts[0].functionResponse?.response as Record<
        string,
        unknown
      >;
      const content = (resp?.['output'] as string) ?? JSON.stringify(resp);
      if (content.includes(`<${MASKING_INDICATOR_TAG}`)) return 100;

      if (toolName === 't1') return 60000;
      if (toolName === 't2') return 20000;
      if (toolName === 't3') return 10000;
      return 0;
    });

    // Scanned: Turn 2 (20k), Turn 1 (60k). Total = 80k.
    // Turn 2: Cumulative = 20k. Protected (<= 50k).
    // Turn 1: Cumulative = 80k. Crossed 50k boundary. Prunabled.
    // Total Prunable = 60k (> 30k trigger).
    const result = await service.mask(history, mockConfig);

    expect(result.maskedCount).toBe(1);
    expect(getToolResponse(result.newHistory[0].parts?.[0])).toContain(
      `<${MASKING_INDICATOR_TAG}`,
    );
    expect(getToolResponse(result.newHistory[1].parts?.[0])).toEqual(
      'B'.repeat(20000),
    );
    expect(getToolResponse(result.newHistory[2].parts?.[0])).toEqual(
      'C'.repeat(10000),
    );
  });

  it('should perform global aggregation for many small parts once boundary is hit', async () => {
    // history.length = 12. Skip index 11 (latest).
    // Indices 0-10: 10k each.
    // Index 10: 10k (Sum 10k)
    // Index 9: 10k (Sum 20k)
    // Index 8: 10k (Sum 30k)
    // Index 7: 10k (Sum 40k)
    // Index 6: 10k (Sum 50k) - Boundary hit here?
    // Actually, Boundary is 50k. So Index 6 crosses it.
    // Index 6, 5, 4, 3, 2, 1, 0 are all prunable. (7 * 10k = 70k).
    const history: Content[] = Array.from({ length: 12 }, (_, i) => ({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: `tool${i}`,
            response: { output: 'A'.repeat(10000) },
          },
        },
      ],
    }));

    mockedEstimateTokenCountSync.mockImplementation((parts: Part[]) => {
      const resp = parts[0].functionResponse?.response as
        | { output?: string; result?: string }
        | string
        | undefined;
      const content =
        typeof resp === 'string'
          ? resp
          : resp?.output || resp?.result || JSON.stringify(resp);
      if (content?.includes(`<${MASKING_INDICATOR_TAG}`)) return 100;
      return content?.length || 0;
    });

    const result = await service.mask(history, mockConfig);

    expect(result.maskedCount).toBe(6); // boundary at 50k protects 0-5
    expect(result.tokensSaved).toBeGreaterThan(0);
  });

  it('should verify tool-aware previews (shell vs generic)', async () => {
    const shellHistory: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: SHELL_TOOL_NAME,
              response: {
                output:
                  'Output: line1\nline2\nline3\nline4\nline5\nError: failed\nExit Code: 1',
              },
            },
          },
        ],
      },
      // Protection buffer
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'p',
              response: { output: 'p'.repeat(60000) },
            },
          },
        ],
      },
      // Latest turn
      {
        role: 'user',
        parts: [{ functionResponse: { name: 'l', response: { output: 'l' } } }],
      },
    ];

    mockedEstimateTokenCountSync.mockImplementation((parts: Part[]) => {
      const name = parts[0].functionResponse?.name;
      const resp = parts[0].functionResponse?.response as Record<
        string,
        unknown
      >;
      const content = (resp?.['output'] as string) ?? JSON.stringify(resp);
      if (content.includes(`<${MASKING_INDICATOR_TAG}`)) return 100;

      if (name === SHELL_TOOL_NAME) return 100000;
      if (name === 'p') return 60000;
      return 100;
    });

    const result = await service.mask(shellHistory, mockConfig);
    const maskedBash = getToolResponse(result.newHistory[0].parts?.[0]);

    expect(maskedBash).toContain('Output: line1\nline2\nline3\nline4\nline5');
    expect(maskedBash).toContain('Exit Code: 1');
    expect(maskedBash).toContain('Error: failed');
  });

  it('should skip already masked content and not count it towards totals', async () => {
    const history: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'tool1',
              response: {
                output: `<${MASKING_INDICATOR_TAG}>...</${MASKING_INDICATOR_TAG}>`,
              },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'tool2',
              response: { output: 'A'.repeat(60000) },
            },
          },
        ],
      },
    ];
    mockedEstimateTokenCountSync.mockReturnValue(60000);

    const result = await service.mask(history, mockConfig);
    expect(result.maskedCount).toBe(0); // tool1 skipped, tool2 is the "latest" which is protected
  });

  it('should handle different response keys in masked update', async () => {
    const history: Content[] = [
      {
        role: 'model',
        parts: [
          {
            functionResponse: {
              name: 't1',
              response: { result: 'A'.repeat(60000) },
            },
          },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            functionResponse: {
              name: 'p',
              response: { output: 'P'.repeat(60000) },
            },
          },
        ],
      },
      { role: 'user', parts: [{ text: 'latest' }] },
    ];

    mockedEstimateTokenCountSync.mockImplementation((parts: Part[]) => {
      const resp = parts[0].functionResponse?.response as Record<
        string,
        unknown
      >;
      const content =
        (resp?.['output'] as string) ??
        (resp?.['result'] as string) ??
        JSON.stringify(resp);
      if (content.includes(`<${MASKING_INDICATOR_TAG}`)) return 100;
      return 60000;
    });

    const result = await service.mask(history, mockConfig);
    expect(result.maskedCount).toBe(2); // both t1 and p are prunable (cumulative 60k and 120k)
    const responseObj = result.newHistory[0].parts?.[0].functionResponse
      ?.response as Record<string, unknown>;
    expect(Object.keys(responseObj)).toEqual(['output']);
  });

  it('should preserve multimodal parts while masking tool responses', async () => {
    const history: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 't1',
              response: { output: 'A'.repeat(60000) },
            },
          },
          {
            inlineData: {
              data: 'base64data',
              mimeType: 'image/png',
            },
          },
        ],
      },
      // Protection buffer
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'p',
              response: { output: 'p'.repeat(60000) },
            },
          },
        ],
      },
      // Latest turn
      { role: 'user', parts: [{ text: 'latest' }] },
    ];

    mockedEstimateTokenCountSync.mockImplementation((parts: Part[]) => {
      const resp = parts[0].functionResponse?.response as Record<
        string,
        unknown
      >;
      const content = (resp?.['output'] as string) ?? JSON.stringify(resp);
      if (content.includes(`<${MASKING_INDICATOR_TAG}`)) return 100;

      if (parts[0].functionResponse?.name === 't1') return 60000;
      if (parts[0].functionResponse?.name === 'p') return 60000;
      return 100;
    });

    const result = await service.mask(history, mockConfig);

    expect(result.maskedCount).toBe(2); //Both t1 and p are prunable (cumulative 60k each > 50k protection)
    expect(result.newHistory[0].parts).toHaveLength(2);
    expect(result.newHistory[0].parts?.[0].functionResponse).toBeDefined();
    expect(
      (
        result.newHistory[0].parts?.[0].functionResponse?.response as Record<
          string,
          unknown
        >
      )['output'],
    ).toContain(`<${MASKING_INDICATOR_TAG}`);
    expect(result.newHistory[0].parts?.[1].inlineData).toEqual({
      data: 'base64data',
      mimeType: 'image/png',
    });
  });

  it('should match the expected snapshot for a masked tool output', async () => {
    const history: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: SHELL_TOOL_NAME,
              response: {
                output: 'Line\n'.repeat(25),
                exitCode: 0,
              },
            },
          },
        ],
      },
      // Buffer to push shell_tool into prunable territory
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'padding',
              response: { output: 'B'.repeat(60000) },
            },
          },
        ],
      },
      { role: 'user', parts: [{ text: 'latest' }] },
    ];

    mockedEstimateTokenCountSync.mockImplementation((parts: Part[]) => {
      const resp = parts[0].functionResponse?.response as Record<
        string,
        unknown
      >;
      const content = (resp?.['output'] as string) ?? JSON.stringify(resp);
      if (content.includes(`<${MASKING_INDICATOR_TAG}`)) return 100;

      if (parts[0].functionResponse?.name === SHELL_TOOL_NAME) return 1000;
      if (parts[0].functionResponse?.name === 'padding') return 60000;
      return 10;
    });

    const result = await service.mask(history, mockConfig);

    // Verify complete masking: only 'output' key should exist
    const responseObj = result.newHistory[0].parts?.[0].functionResponse
      ?.response as Record<string, unknown>;
    expect(Object.keys(responseObj)).toEqual(['output']);

    const response = responseObj['output'] as string;

    // We replace the random part of the filename for deterministic snapshots
    // and normalize path separators for cross-platform compatibility
    const normalizedResponse = response.replace(/\\/g, '/');
    const deterministicResponse = normalizedResponse
      .replace(new RegExp(testTempDir.replace(/\\/g, '/'), 'g'), '/mock/temp')
      .replace(
        new RegExp(`${SHELL_TOOL_NAME}_[^\\s"]+\\.txt`, 'g'),
        `${SHELL_TOOL_NAME}_deterministic.txt`,
      );

    expect(deterministicResponse).toMatchSnapshot();
  });

  it('should not mask if masking increases token count (due to overhead)', async () => {
    const history: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'tiny_tool',
              response: { output: 'tiny' },
            },
          },
        ],
      },
      // Protection buffer to push tiny_tool into prunable territory
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'padding',
              response: { output: 'B'.repeat(60000) },
            },
          },
        ],
      },
      { role: 'user', parts: [{ text: 'latest' }] },
    ];

    mockedEstimateTokenCountSync.mockImplementation((parts: Part[]) => {
      if (parts[0].functionResponse?.name === 'tiny_tool') return 5;
      if (parts[0].functionResponse?.name === 'padding') return 60000;
      return 1000; // The masked version would be huge due to boilerplate
    });

    const result = await service.mask(history, mockConfig);
    expect(result.maskedCount).toBe(0); // padding is protected, tiny_tool would increase size
  });

  it('should never mask exempt tools (like activate_skill) even if they are deep in history', async () => {
    const history: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: ACTIVATE_SKILL_TOOL_NAME,
              response: { output: 'High value instructions for skill' },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: MEMORY_TOOL_NAME,
              response: { output: 'Important user preference' },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'bulky_tool',
              response: { output: 'A'.repeat(60000) },
            },
          },
        ],
      },
      // Protection buffer
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'padding',
              response: { output: 'B'.repeat(60000) },
            },
          },
        ],
      },
      { role: 'user', parts: [{ text: 'latest' }] },
    ];

    mockedEstimateTokenCountSync.mockImplementation((parts: Part[]) => {
      const resp = parts[0].functionResponse?.response as Record<
        string,
        unknown
      >;
      const content = (resp?.['output'] as string) ?? JSON.stringify(resp);
      if (content.includes(`<${MASKING_INDICATOR_TAG}`)) return 100;

      const name = parts[0].functionResponse?.name;
      if (name === ACTIVATE_SKILL_TOOL_NAME) return 1000;
      if (name === MEMORY_TOOL_NAME) return 500;
      if (name === 'bulky_tool') return 60000;
      if (name === 'padding') return 60000;
      return 10;
    });

    const result = await service.mask(history, mockConfig);

    // Both 'bulky_tool' and 'padding' should be masked.
    // 'padding' (Index 3) crosses the 50k protection boundary immediately.
    // ACTIVATE_SKILL and MEMORY are exempt.
    expect(result.maskedCount).toBe(2);
    expect(result.newHistory[0].parts?.[0].functionResponse?.name).toBe(
      ACTIVATE_SKILL_TOOL_NAME,
    );
    expect(
      (
        result.newHistory[0].parts?.[0].functionResponse?.response as Record<
          string,
          unknown
        >
      )['output'],
    ).toBe('High value instructions for skill');

    expect(result.newHistory[1].parts?.[0].functionResponse?.name).toBe(
      MEMORY_TOOL_NAME,
    );
    expect(
      (
        result.newHistory[1].parts?.[0].functionResponse?.response as Record<
          string,
          unknown
        >
      )['output'],
    ).toBe('Important user preference');

    expect(result.newHistory[2].parts?.[0].functionResponse?.name).toBe(
      'bulky_tool',
    );
    expect(
      (
        result.newHistory[2].parts?.[0].functionResponse?.response as Record<
          string,
          unknown
        >
      )['output'],
    ).toContain(MASKING_INDICATOR_TAG);
  });
});
