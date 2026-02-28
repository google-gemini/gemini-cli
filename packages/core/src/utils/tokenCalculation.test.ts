/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  calculateRequestTokenCount,
  estimateTokenCountSync,
} from './tokenCalculation.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { Part } from '@google/genai';

describe('tokenCalculation', () => {
  describe('calculateRequestTokenCount', () => {
    const mockContentGenerator = {
      countTokens: vi.fn(),
    } as unknown as ContentGenerator;

    const model = 'gemini-pro';

    it('should use countTokens API for media requests (images/files)', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockResolvedValue({
        totalTokens: 100,
      });
      const request = [{ inlineData: { mimeType: 'image/png', data: 'data' } }];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(100);
      expect(mockContentGenerator.countTokens).toHaveBeenCalled();
    });

    it('should estimate tokens locally for tool calls', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockClear();
      const request = [{ functionCall: { name: 'foo', args: { bar: 'baz' } } }];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBeGreaterThan(0);
      expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
    });

    it('should estimate tokens locally for simple ASCII text', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockClear();
      // 12 chars. 12 * 0.25 = 3 tokens.
      const request = 'Hello world!';

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(3);
      expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
    });

    it('should estimate tokens locally for CJK text with higher weight', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockClear();
      // 2 chars. 2 * 1.3 = 2.6 -> floor(2.6) = 2.
      const request = '你好';

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBeGreaterThanOrEqual(2);
      expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
    });

    it('should handle mixed content', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockClear();
      // 'Hi': 2 * 0.25 = 0.5
      // '你好': 2 * 1.3 = 2.6
      // Total: 3.1 -> 3
      const request = 'Hi你好';

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(3);
      expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
    });

    it('should handle empty text', async () => {
      const request = '';
      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );
      expect(count).toBe(0);
    });

    it('should fallback to local estimation when countTokens API fails', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockRejectedValue(
        new Error('API error'),
      );
      const request = [
        { text: 'Hello' },
        { inlineData: { mimeType: 'image/png', data: 'data' } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(3001);
      expect(mockContentGenerator.countTokens).toHaveBeenCalled();
    });

    it('should use fixed estimate for images in fallback', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockRejectedValue(
        new Error('API error'),
      );
      const request = [
        { inlineData: { mimeType: 'image/png', data: 'large_data' } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(3000);
    });

    it('should use countTokens API for PDF requests', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockResolvedValue({
        totalTokens: 5160,
      });
      const request = [
        { inlineData: { mimeType: 'application/pdf', data: 'pdf_data' } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(5160);
      expect(mockContentGenerator.countTokens).toHaveBeenCalled();
    });

    it('should use fixed estimate for PDFs in fallback', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockRejectedValue(
        new Error('API error'),
      );
      const request = [
        { inlineData: { mimeType: 'application/pdf', data: 'large_pdf_data' } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      // PDF estimate: 25800 tokens (~100 pages at 258 tokens/page)
      expect(count).toBe(25800);
    });

    it('should use countTokens API for audio requests', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockResolvedValue({
        totalTokens: 960,
      });
      const request = [
        { inlineData: { mimeType: 'audio/mpeg', data: 'audio_data' } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(960);
      expect(mockContentGenerator.countTokens).toHaveBeenCalled();
    });

    it('should use duration-based estimate for audio in fallback', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockRejectedValue(
        new Error('API error'),
      );
      // ~5 seconds of audio: 5 * 16,000 = 80,000 bytes -> base64 ≈ 106,667
      const base64Data = 'A'.repeat(106_667);
      const request = [
        { inlineData: { mimeType: 'audio/mpeg', data: base64Data } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      // rawBytes ≈ 80,000 -> ~5s -> ceil(5 * 32) = 160
      expect(count).toBeGreaterThanOrEqual(155);
      expect(count).toBeLessThanOrEqual(165);
    });

    it('should use countTokens API for video requests', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockResolvedValue({
        totalTokens: 5800,
      });
      const request = [
        { inlineData: { mimeType: 'video/mp4', data: 'video_data' } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      expect(count).toBe(5800);
      expect(mockContentGenerator.countTokens).toHaveBeenCalled();
    });

    it('should use duration-based estimate for video in fallback', async () => {
      vi.mocked(mockContentGenerator.countTokens).mockRejectedValue(
        new Error('API error'),
      );
      // ~5 seconds of video: 5 * 250,000 = 1,250,000 bytes -> base64 ≈ 1,666,667
      const base64Data = 'V'.repeat(1_666_667);
      const request = [
        { inlineData: { mimeType: 'video/mp4', data: base64Data } },
      ];

      const count = await calculateRequestTokenCount(
        request,
        mockContentGenerator,
        model,
      );

      // rawBytes ≈ 1,250,000 -> ~5s -> ceil(5 * 290) = 1450
      expect(count).toBeGreaterThanOrEqual(1440);
      expect(count).toBeLessThanOrEqual(1460);
    });
  });

  describe('estimateTokenCountSync', () => {
    it('should use fast heuristic for massive strings', () => {
      const massiveText = 'a'.repeat(200_000);
      // 200,000 / 4 = 50,000 tokens
      const parts: Part[] = [{ text: massiveText }];
      expect(estimateTokenCountSync(parts)).toBe(50000);
    });

    it('should estimate functionResponse without full stringification', () => {
      const toolResult = 'result'.repeat(1000); // 6000 chars
      const parts: Part[] = [
        {
          functionResponse: {
            name: 'my_tool',
            id: '123',
            response: { output: toolResult },
          },
        },
      ];

      const tokens = estimateTokenCountSync(parts);
      // payload ~6013 chars / 4 = 1503.25
      // name 7 / 4 = 1.75
      // total ~1505
      expect(tokens).toBeGreaterThan(1500);
      expect(tokens).toBeLessThan(1600);
    });

    it('should handle Gemini 3 multimodal nested parts in functionResponse', () => {
      const parts: Part[] = [
        {
          functionResponse: {
            name: 'multimodal_tool',
            id: '456',
            response: { status: 'success' },
            // Gemini 3 nested parts
            parts: [
              { inlineData: { mimeType: 'image/png', data: 'base64...' } },
              { text: 'Look at this image' },
            ] as Part[],
          },
        },
      ];

      const tokens = estimateTokenCountSync(parts);
      // image 3000 + text 4.5 + response 5 = ~3009.5
      expect(tokens).toBeGreaterThan(3000);
      expect(tokens).toBeLessThan(3100);
    });

    it('should respect the maximum recursion depth limit', () => {
      // Create a structure nested to depth 5 (exceeding limit of 3)
      const parts: Part[] = [
        {
          functionResponse: {
            name: 'd0',
            response: { val: 'a' }, // ~12 chars -> 3 tokens
            parts: [
              {
                functionResponse: {
                  name: 'd1',
                  response: { val: 'a' }, // ~12 chars -> 3 tokens
                  parts: [
                    {
                      functionResponse: {
                        name: 'd2',
                        response: { val: 'a' }, // ~12 chars -> 3 tokens
                        parts: [
                          {
                            functionResponse: {
                              name: 'd3',
                              response: { val: 'a' }, // ~12 chars -> 3 tokens
                              parts: [
                                {
                                  functionResponse: {
                                    name: 'd4',
                                    response: { val: 'a' },
                                  },
                                },
                              ] as Part[],
                            },
                          },
                        ] as Part[],
                      },
                    },
                  ] as Part[],
                },
              },
            ] as Part[],
          },
        },
      ];

      const tokens = estimateTokenCountSync(parts);
      // It should count d0, d1, d2, d3 (depth 0, 1, 2, 3) but NOT d4 (depth 4)
      // d0..d3: 4 * ~4 tokens = ~16
      expect(tokens).toBeGreaterThan(10);
      expect(tokens).toBeLessThan(30);
    });

    it('should handle empty or nullish inputs gracefully', () => {
      expect(estimateTokenCountSync([])).toBe(0);
      expect(estimateTokenCountSync([{ text: '' }])).toBe(0);
      expect(estimateTokenCountSync([{} as Part])).toBe(0);
    });

    describe('audio token estimation', () => {
      it('should estimate audio tokens from inlineData base64 size', () => {
        // Simulate ~10 seconds of 128kbps MP3 audio:
        // 10s * 16,000 bytes/s = 160,000 raw bytes
        // base64 length = 160,000 / 0.75 ≈ 213,333 chars
        const base64Data = 'A'.repeat(213_333);
        const parts: Part[] = [
          { inlineData: { mimeType: 'audio/mpeg', data: base64Data } },
        ];

        const tokens = estimateTokenCountSync(parts);
        // rawBytes = 213,333 * 0.75 = 159,999.75
        // duration = 159,999.75 / 16,000 ≈ 10s
        // tokens = ceil(10 * 32) = 320
        expect(tokens).toBeGreaterThanOrEqual(310);
        expect(tokens).toBeLessThanOrEqual(330);
      });

      it('should use default estimate for audio fileData without base64', () => {
        const parts: Part[] = [
          {
            fileData: {
              mimeType: 'audio/wav',
              fileUri: 'gs://bucket/recording.wav',
            },
          },
        ];

        const tokens = estimateTokenCountSync(parts);
        // Default audio estimate: 3840 tokens (~2 min at 32 tokens/sec)
        expect(tokens).toBe(3840);
      });

      it('should handle various audio MIME types', () => {
        const mimeTypes = [
          'audio/mpeg',
          'audio/wav',
          'audio/ogg',
          'audio/flac',
          'audio/aac',
          'audio/mp4',
        ];

        for (const mimeType of mimeTypes) {
          const parts: Part[] = [
            {
              fileData: { mimeType, fileUri: 'gs://bucket/file' },
            },
          ];
          // All should use the audio estimation path, not the JSON fallback
          expect(estimateTokenCountSync(parts)).toBe(3840);
        }
      });

      it('should return 0 tokens for empty base64 data', () => {
        const parts: Part[] = [
          { inlineData: { mimeType: 'audio/mpeg', data: '' } },
        ];

        const tokens = estimateTokenCountSync(parts);
        // Empty data = 0 bytes = 0 seconds = 0 tokens
        expect(tokens).toBe(0);
      });

      it('should estimate small audio clips with minimal tokens', () => {
        // ~1 second of audio: 16,000 raw bytes -> base64 ≈ 21,333 chars
        const base64Data = 'B'.repeat(21_333);
        const parts: Part[] = [
          { inlineData: { mimeType: 'audio/mp4', data: base64Data } },
        ];

        const tokens = estimateTokenCountSync(parts);
        // rawBytes ≈ 16,000 -> duration ≈ 1s -> tokens = ceil(32) = 32
        expect(tokens).toBeGreaterThanOrEqual(30);
        expect(tokens).toBeLessThanOrEqual(34);
      });
    });

    describe('video token estimation', () => {
      it('should estimate video tokens from inlineData base64 size', () => {
        // Simulate ~10 seconds of ~2Mbps video:
        // 10s * 250,000 bytes/s = 2,500,000 raw bytes
        // base64 length = 2,500,000 / 0.75 ≈ 3,333,333 chars
        const base64Data = 'V'.repeat(3_333_333);
        const parts: Part[] = [
          { inlineData: { mimeType: 'video/mp4', data: base64Data } },
        ];

        const tokens = estimateTokenCountSync(parts);
        // rawBytes ≈ 2,500,000 -> duration ≈ 10s
        // tokens = ceil(10 * 290) = 2900
        expect(tokens).toBeGreaterThanOrEqual(2880);
        expect(tokens).toBeLessThanOrEqual(2920);
      });

      it('should use default estimate for video fileData without base64', () => {
        const parts: Part[] = [
          {
            fileData: {
              mimeType: 'video/mp4',
              fileUri: 'gs://bucket/clip.mp4',
            },
          },
        ];

        const tokens = estimateTokenCountSync(parts);
        // Default video estimate: 17,400 tokens (~1 min at 290 tokens/sec)
        expect(tokens).toBe(17400);
      });

      it('should return 0 tokens for empty base64 video data', () => {
        const parts: Part[] = [
          { inlineData: { mimeType: 'video/mp4', data: '' } },
        ];

        const tokens = estimateTokenCountSync(parts);
        // Empty data = 0 bytes = 0 seconds = 0 tokens
        expect(tokens).toBe(0);
      });

      it('should handle various video MIME types', () => {
        const mimeTypes = [
          'video/mp4',
          'video/webm',
          'video/quicktime',
          'video/x-msvideo',
        ];

        for (const mimeType of mimeTypes) {
          const parts: Part[] = [
            {
              fileData: { mimeType, fileUri: 'gs://bucket/file' },
            },
          ];
          expect(estimateTokenCountSync(parts)).toBe(17400);
        }
      });
    });

    describe('mixed multimodal content', () => {
      it('should correctly sum tokens for text + audio + image parts', () => {
        // "Describe this audio" = 19 ASCII chars -> 19 * 0.25 = 4.75 tokens
        // audio fileData -> 3840 default tokens
        // image -> 3000 tokens
        const parts: Part[] = [
          { text: 'Describe this audio' },
          {
            fileData: {
              mimeType: 'audio/mpeg',
              fileUri: 'gs://bucket/speech.mp3',
            },
          },
          { inlineData: { mimeType: 'image/png', data: 'img_data' } },
        ];

        const tokens = estimateTokenCountSync(parts);
        // floor(4.75 + 3840 + 3000) = floor(6844.75) = 6844
        expect(tokens).toBe(6844);
      });

      it('should handle Gemini 3 nested audio parts in functionResponse', () => {
        const parts: Part[] = [
          {
            functionResponse: {
              name: 'audio_tool',
              id: '789',
              response: { status: 'ok' },
              parts: [
                {
                  fileData: {
                    mimeType: 'audio/wav',
                    fileUri: 'gs://bucket/output.wav',
                  },
                },
                { text: 'Audio transcription here' },
              ] as Part[],
            },
          },
        ];

        const tokens = estimateTokenCountSync(parts);
        // audio default 3840 + text 6 + response ~4 + name ~2 = ~3852
        expect(tokens).toBeGreaterThan(3840);
        expect(tokens).toBeLessThan(3900);
      });
    });
  });
});
