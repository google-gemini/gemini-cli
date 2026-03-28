/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolOutputDistillationService } from './toolDistillationService.js';
import type { Config } from '../index.js';
import type { GeminiClient } from '../core/client.js';

describe('ToolOutputDistillationService', () => {
  let mockConfig: Config;
  let mockGeminiClient: GeminiClient;
  let service: ToolOutputDistillationService;

  beforeEach(() => {
    mockConfig = {
      getTruncateToolOutputThreshold: vi.fn().mockReturnValue(100),
      getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
      getOversizedOutputSummarizationEnabled: vi.fn().mockReturnValue(true),
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
    // > threshold * SUMMARIZATION_THRESHOLD
    const largeContent = 'A'.repeat(401);
    const result = await service.distill('test-tool', 'call-1', largeContent);

    expect(mockGeminiClient.generateContent).toHaveBeenCalled();
    expect(result.truncatedContent).toContain('Mock Intent Summary');
  });

  it('should skip structural map for extremely large content exceeding MAX_DISTILLATION_SIZE', async () => {
    const massiveContent = 'A'.repeat(1_000_001); // > MAX_DISTILLATION_SIZE
    const result = await service.distill('test-tool', 'call-2', massiveContent);

    expect(mockGeminiClient.generateContent).not.toHaveBeenCalled();
    expect(result.truncatedContent).not.toContain('Mock Intent Summary');
  });

  it('should skip structural map for content below summarization threshold', async () => {
    // > threshold but < threshold * SUMMARIZATION_THRESHOLD
    const mediumContent = 'A'.repeat(110);
    const result = await service.distill('test-tool', 'call-3', mediumContent);

    expect(mockGeminiClient.generateContent).not.toHaveBeenCalled();
    expect(result.truncatedContent).not.toContain('Mock Intent Summary');
  });
});
