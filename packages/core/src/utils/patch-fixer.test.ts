/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { fixFailedHunk } from './patch-fixer.js';
import { type Hunk } from './patcher.js';
import { type GeminiClient } from '../core/client.js';

describe('fixFailedHunk', () => {
  it('should call the Gemini client with the correct prompt and return the corrected patch', async () => {
    const mockGeminiClient = {
      generateJson: vi.fn(),
    } as unknown as GeminiClient;

    const failedHunk: Hunk = {
      oldStart: 10,
      oldCount: 3,
      newStart: 10,
      newCount: 3,
      lines: ['- old line 1', '- old line 2', '+ new line 1', '+ new line 2'],
      originalHunk:
        '@@ -10,3 +10,3 @@\n- old line 1\n- old line 2\n+ new line 1\n+ new line 2',
      header: '@@ -10,3 +10,3 @@',
    };

    const currentContent =
      'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nold line 1\nold line 2\nline12\n';
    const correctedPatch =
      '@@ -10,2 +10,2 @@\n- old line 1\n- old line 2\n+ new line 1\n+ new line 2';

    vi.mocked(mockGeminiClient.generateJson).mockResolvedValue({
      patch: correctedPatch,
    });

    const result = await fixFailedHunk(
      failedHunk,
      'file.ts',
      currentContent,
      mockGeminiClient,
      new AbortController().signal,
    );

    expect(mockGeminiClient.generateJson).toHaveBeenCalledOnce();
    const [contents] = vi.mocked(mockGeminiClient.generateJson).mock.calls[0];
    if (!contents?.[0]?.parts?.[0]?.text) {
      throw new Error('Prompt text not found in mock call');
    }
    const prompt = contents[0].parts[0].text;

    expect(prompt).toContain('file.ts');
    expect(prompt).toContain(currentContent);
    expect(prompt).toContain(failedHunk.originalHunk);
    expect(prompt).toContain('You are an automated patch-fixing utility.');

    expect(result).toBe(correctedPatch);
  });
});
