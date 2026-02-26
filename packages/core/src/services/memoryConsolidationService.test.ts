/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { MemoryConsolidationService } from './memoryConsolidationService.js';
import type { Config } from '../config/config.js';

vi.mock('node:fs/promises');

describe('MemoryConsolidationService', () => {
  let mockConfig: Config;
  let service: MemoryConsolidationService;
  let mockGenerateContent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    mockGenerateContent = vi.fn().mockResolvedValue({
      text: 'Mocked consolidated fact.',
    });

    mockConfig = {
      getIsForeverMode: vi.fn().mockReturnValue(true),
      getBaseLlmClient: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
      storage: {
        getKnowledgeDir: vi.fn().mockReturnValue('/mock/knowledge/dir'),
      },
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

  it('should trigger consolidation and append to hippocampus.md', async () => {
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

    expect(fs.mkdir).toHaveBeenCalledWith('/mock/knowledge/dir', {
      recursive: true,
    });

    const appendFileArgs = vi.mocked(fs.appendFile).mock.calls[0];
    expect(appendFileArgs[0]).toBe(
      path.join('/mock/knowledge/dir', 'hippocampus.md'),
    );
    expect(appendFileArgs[1]).toMatch(
      /\[\d{2}:\d{2}:\d{2}\] - Mocked consolidated fact\.\n/,
    );
  });
});
