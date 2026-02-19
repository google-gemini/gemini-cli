/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ToolPreselectionService } from './toolPreselectionService.js';
import type { Config } from '../config/config.js';
import type { FunctionDeclaration } from '@google/genai';

describe('ToolPreselectionService', () => {
  let mockConfig: Config;
  let mockLlmClient: Record<string, Mock>;
  let service: ToolPreselectionService;

  beforeEach(() => {
    mockLlmClient = {
      generateJson: vi.fn(),
    };

    mockConfig = {
      getBaseLlmClient: vi.fn().mockReturnValue(mockLlmClient),
    } as unknown as Config;

    service = new ToolPreselectionService(mockConfig);
  });

  it('returns all tools if count is below threshold', async () => {
    const tools: FunctionDeclaration[] = [
      { name: 'tool1', description: 'desc1' },
      { name: 'tool2', description: 'desc2' },
    ];
    const result = await service.selectTools(
      'query',
      tools,
      new AbortController().signal,
    );
    expect(result).toEqual(['tool1', 'tool2']);
    expect(mockLlmClient['generateJson']).not.toHaveBeenCalled();
  });

  it('calls LLM for pre-selection if count is above threshold', async () => {
    const tools: FunctionDeclaration[] = [
      { name: 'tool1', description: 'desc1' },
      { name: 'tool2', description: 'desc2' },
      { name: 'tool3', description: 'desc3' },
      { name: 'tool4', description: 'desc4' },
      { name: 'tool5', description: 'desc5' },
      { name: 'tool6', description: 'desc6' },
    ];

    mockLlmClient['generateJson'].mockResolvedValue({
      relevant_tools: ['tool1', 'tool3'],
    });

    const result = await service.selectTools(
      'my query',
      tools,
      new AbortController().signal,
    );

    expect(result).toEqual(['tool1', 'tool3']);
    expect(mockLlmClient['generateJson']).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: expect.stringContaining('my query'),
              },
            ],
          },
        ],
      }),
    );
  });

  it('respects maxTools option', async () => {
    const tools: FunctionDeclaration[] = [
      { name: 'tool1', description: 'desc1' },
      { name: 'tool2', description: 'desc2' },
      { name: 'tool3', description: 'desc3' },
    ];

    mockLlmClient['generateJson'].mockResolvedValue({
      relevant_tools: ['tool1'],
    });

    const result = await service.selectTools(
      'query',
      tools,
      new AbortController().signal,
      { maxTools: 2 },
    );
    expect(result).toEqual(['tool1']);
    expect(mockLlmClient['generateJson']).toHaveBeenCalled();
  });

  it('falls back to all tools if LLM call fails', async () => {
    const tools: FunctionDeclaration[] = [
      { name: 'tool1', description: 'desc1' },
      { name: 'tool2', description: 'desc2' },
      { name: 'tool3', description: 'desc3' },
      { name: 'tool4', description: 'desc4' },
      { name: 'tool5', description: 'desc5' },
      { name: 'tool6', description: 'desc6' },
    ];

    mockLlmClient['generateJson'].mockRejectedValue(new Error('LLM error'));

    const result = await service.selectTools(
      'query',
      tools,
      new AbortController().signal,
    );
    expect(result).toEqual([
      'tool1',
      'tool2',
      'tool3',
      'tool4',
      'tool5',
      'tool6',
    ]);
  });
});
