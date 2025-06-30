/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { Content } from '@google/genai';
import { GeminiClient } from '../core/client.js';
import { Config as OriginalConfig } from '../config/config.js';
import { summarizeToolOutput } from './toolOutputSummarizer.js';
import { GeminiChat } from '../core/geminiChat.js';

// Mock dependencies
vi.mock('../core/client.js');
vi.mock('../config/config.js', () => ({
  Config: {
    create: vi.fn().mockResolvedValue({
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    }),
  },
}));
vi.mock('../core/geminiChat.js');

const Config = OriginalConfig as unknown as {
  create: Mock<(...args: any[]) => Promise<any>>;
};

describe('summarizeToolOutput', () => {
  let mockGeminiClient: GeminiClient;
  let mockChat: GeminiChat;
  const abortSignal = new AbortController().signal;

  beforeEach(async () => {
    const mockConfig = await Config.create({} as any);
    mockGeminiClient = new (vi.mocked(GeminiClient))(mockConfig);
    mockChat = new (vi.mocked(GeminiChat))({} as any, {} as any, {} as any);

    vi.spyOn(mockGeminiClient, 'getChat').mockReturnValue(mockChat);
    vi.spyOn(mockChat, 'getHistory').mockReturnValue([]);

    mockGeminiClient.generateJson = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return the original text if it is null or empty', async () => {
    let result = await summarizeToolOutput(
      null as any,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
    expect(mockGeminiClient.generateJson).not.toHaveBeenCalled();

    result = await summarizeToolOutput('', mockGeminiClient, abortSignal);
    expect(result).toBe('');
    expect(mockGeminiClient.generateJson).not.toHaveBeenCalled();
  });

  it('should return the original text if it is shorter than maxLength', async () => {
    const shortText = 'This is a short text.';
    const result = await summarizeToolOutput(
      shortText,
      mockGeminiClient,
      abortSignal,
      100,
    );
    expect(result).toBe(shortText);
    expect(mockGeminiClient.generateJson).not.toHaveBeenCalled();
  });

  it('should call generateJson and return summary when text is long', async () => {
    const longText =
      'This is a very long text that needs to be summarized.'.repeat(100);
    const summary = 'This is a summary.';
    (mockGeminiClient.generateJson as Mock).mockResolvedValue({ summary });

    const result = await summarizeToolOutput(
      longText,
      mockGeminiClient,
      abortSignal,
      100,
    );

    expect(mockGeminiClient.generateJson).toHaveBeenCalled();
    expect(result).toBe(summary);
  });

  it('should return original text if generateJson response has no summary', async () => {
    const longText = 'This is another long text.'.repeat(100);
    (mockGeminiClient.generateJson as Mock).mockResolvedValue({
      notASummary: 'foo',
    });

    const result = await summarizeToolOutput(
      longText,
      mockGeminiClient,
      abortSignal,
      100,
    );

    expect(mockGeminiClient.generateJson).toHaveBeenCalled();
    expect(result).toBe(longText);
  });

  it('should return original text if generateJson throws an error', async () => {
    const longText = 'This is a long text that will cause an error.'.repeat(
      100,
    );
    const error = new Error('API Error');
    (mockGeminiClient.generateJson as Mock).mockRejectedValue(error);
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await summarizeToolOutput(
      longText,
      mockGeminiClient,
      abortSignal,
      100,
    );

    expect(mockGeminiClient.generateJson).toHaveBeenCalled();
    expect(result).toBe(longText);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to summarize tool output.',
      error,
    );

    consoleErrorSpy.mockRestore();
  });

  it('should include history in the prompt to generateJson', async () => {
    const longText =
      'This is a very long text that needs to be summarized.'.repeat(100);
    const summary = 'This is a summary.';
    const history: Content[] = [{ role: 'user', parts: [{ text: 'Hello' }] }];

    (mockChat.getHistory as Mock).mockReturnValue(history);
    (mockGeminiClient.generateJson as Mock).mockResolvedValue({ summary });

    await summarizeToolOutput(longText, mockGeminiClient, abortSignal, 100);

    expect(mockGeminiClient.generateJson).toHaveBeenCalled();
    const call = (mockGeminiClient.generateJson as Mock).mock.calls[0];
    const contents = call[0] as Content[];
    if (!contents || contents.length === 0) {
      throw new Error('No contents were passed to generateJson');
    }

    const firstContent = contents[0];
    if (
      !firstContent ||
      !firstContent.parts ||
      firstContent.parts.length === 0
    ) {
      throw new Error('No parts found in the first content');
    }

    const promptPart = firstContent.parts[0];

    if (promptPart && 'text' in promptPart) {
      expect(promptPart.text).toContain(JSON.stringify(history, null, 2));
    } else {
      throw new Error('Prompt part not found or not a text part');
    }
  });
});
