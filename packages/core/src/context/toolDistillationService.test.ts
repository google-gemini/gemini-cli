/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolOutputDistillationService } from './toolDistillationService.js';
import type { Config, Part } from '../index.js';
import type { GeminiClient } from '../core/client.js';

describe('ToolOutputDistillationService', () => {
  let mockConfig: Config;
  let mockGeminiClient: GeminiClient;
  let service: ToolOutputDistillationService;

  beforeEach(() => {
    mockConfig = {
      getToolMaxOutputTokens: vi.fn().mockReturnValue(100),
      getToolSummarizationThresholdTokens: vi.fn().mockReturnValue(100),
      getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini'),
      },
      telemetry: {
        logEvent: vi.fn(),
      },
    } as unknown as Config;
    mockGeminiClient = {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Mock Intent Summary' }] } }],
      }),
    } as unknown as GeminiClient;
    service = new ToolOutputDistillationService(
      mockConfig,
      mockGeminiClient,
      'test-prompt-id',
    );
  });

  it('should generate a structural map for oversized content within limits', async () => {
    // > threshold * SUMMARIZATION_THRESHOLD (100 * 4 = 400)
    const largeContent = 'A'.repeat(500);
    const result = await service.distill('test-tool', 'call-1', largeContent);

    expect(mockGeminiClient.generateContent).toHaveBeenCalled();
    const text =
      typeof result.truncatedContent === 'string'
        ? result.truncatedContent
        : (result.truncatedContent as Array<{ text: string }>)[0].text;
    expect(text).toContain('Strategic Significance');
  });

  it('should structurally truncate functionResponse while preserving schema', async () => {
    // threshold is 100
    const hugeValue = 'H'.repeat(1000);
    const content = [
      {
        functionResponse: {
          name: 'test_tool',
          id: '123',
          response: {
            stdout: hugeValue,
            stderr: 'no error',
          },
        },
      },
    ] as unknown as Part[];

    const result = await service.distill('test-tool', 'call-1', content);
    const truncatedParts = result.truncatedContent as Part[];
    expect(truncatedParts.length).toBe(1);
    const fr = truncatedParts[0].functionResponse!;
    const resp = fr.response as Record<string, unknown>;
    expect(fr.name).toBe('test_tool');
    expect(resp['stderr']).toBe('no error');
    expect(resp['stdout'] as string).toContain('[Message Normalized');
    expect(resp['stdout'] as string).toContain('Full output saved to');
  });

  it('should skip structural map for extremely large content exceeding MAX_DISTILLATION_SIZE', async () => {
    const massiveContent = 'A'.repeat(1_000_001); // > MAX_DISTILLATION_SIZE
    const result = await service.distill('test-tool', 'call-2', massiveContent);

    expect(mockGeminiClient.generateContent).not.toHaveBeenCalled();
    const text =
      typeof result.truncatedContent === 'string'
        ? result.truncatedContent
        : (result.truncatedContent as Array<{ text: string }>)[0].text;
    expect(text).not.toContain('Strategic Significance');
  });

  it('should skip structural map for content below summarization threshold', async () => {
    // > threshold but < threshold * SUMMARIZATION_THRESHOLD
    const mediumContent = 'A'.repeat(110);
    const result = await service.distill('test-tool', 'call-3', mediumContent);

    expect(mockGeminiClient.generateContent).not.toHaveBeenCalled();
    expect(result.truncatedContent).not.toContain('Mock Intent Summary');
  });
});
