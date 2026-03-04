/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryConsolidationService } from './memoryConsolidationService.js';
import type { Config } from '../config/config.js';

describe('MemoryConsolidationService', () => {
  let mockConfig: Config;
  let service: MemoryConsolidationService;
  let mockGenerateContent: ReturnType<typeof vi.fn>;
  let mockAppendHippocampusEntry: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    mockGenerateContent = vi.fn().mockResolvedValue({
      text: 'Mocked consolidated fact.',
    });

    mockAppendHippocampusEntry = vi.fn();

    mockConfig = {
      getIsForeverMode: vi.fn().mockReturnValue(true),
      getBaseLlmClient: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
      appendHippocampusEntry: mockAppendHippocampusEntry,
    } as unknown as Config;

    service = new MemoryConsolidationService(mockConfig);
  });

  it('should not do anything if isForeverMode is false', () => {
    vi.mocked(mockConfig.getIsForeverMode).mockReturnValue(false);
    service.triggerMicroConsolidation([
      { role: 'user', parts: [{ text: 'test' }] },
    ]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('should not do anything if latestTurnContext is empty', () => {
    service.triggerMicroConsolidation([]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('should trigger consolidation and append to in-memory hippocampus', async () => {
    service.triggerMicroConsolidation([
      { role: 'user', parts: [{ text: 'test' }] },
    ]);

    // Wait a tick for the fire-and-forget promise to resolve
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        modelConfigKey: { model: 'gemini-3-flash-preview', isChatModel: false },
        systemInstruction: expect.stringContaining(
          'subconscious memory module',
        ),
      }),
    );

    expect(mockAppendHippocampusEntry).toHaveBeenCalledWith(
      expect.stringMatching(
        /\[\d{2}:\d{2}:\d{2}\] - Mocked consolidated fact\.\n/,
      ),
    );
  });

  it('should not append entry when model returns NO_SIGNIFICANT_FACTS', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'NO_SIGNIFICANT_FACTS',
    });

    service.triggerMicroConsolidation([
      { role: 'user', parts: [{ text: 'test' }] },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockAppendHippocampusEntry).not.toHaveBeenCalled();
  });
});
