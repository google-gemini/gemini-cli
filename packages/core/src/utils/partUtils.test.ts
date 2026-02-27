/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  partToString,
  getResponseText,
  flatMapTextParts,
  appendToLastTextPart,
  base64ByteSize,
  describeInlineData,
} from './partUtils.js';
import type { GenerateContentResponse, Part, PartUnion } from '@google/genai';

const mockResponse = (
  parts?: Array<{ text?: string; functionCall?: unknown }>,
): GenerateContentResponse => ({
  candidates: parts
    ? [{ content: { parts: parts as Part[], role: 'model' }, index: 0 }]
    : [],
  promptFeedback: { safetyRatings: [] },
  text: undefined,
  data: undefined,
  functionCalls: undefined,
  executableCode: undefined,
  codeExecutionResult: undefined,
});

describe('partUtils', () => {
  describe('partToString (default behavior)', () => {
    it('should return empty string for undefined or null', () => {
      // @ts-expect-error Testing invalid input
      expect(partToString(undefined)).toBe('');
      // @ts-expect-error Testing invalid input
      expect(partToString(null)).toBe('');
    });

    it('should return string input unchanged', () => {
      expect(partToString('hello')).toBe('hello');
    });

    it('should concatenate strings from an array', () => {
      expect(partToString(['a', 'b'])).toBe('ab');
    });

    it('should return text property when provided a text part', () => {
      expect(partToString({ text: 'hi' })).toBe('hi');
    });

    it('should return empty string for non-text parts', () => {
      const part: Part = { inlineData: { mimeType: 'image/png', data: '' } };
      expect(partToString(part)).toBe('');
      const part2: Part = { functionCall: { name: 'test' } };
      expect(partToString(part2)).toBe('');
    });
  });

  describe('partToString (verbose)', () => {
    const verboseOptions = { verbose: true };

    it('should return empty string for undefined or null', () => {
      // @ts-expect-error Testing invalid input
      expect(partToString(undefined, verboseOptions)).toBe('');
      // @ts-expect-error Testing invalid input
      expect(partToString(null, verboseOptions)).toBe('');
    });

    it('should return string input unchanged', () => {
      expect(partToString('hello', verboseOptions)).toBe('hello');
    });

    it('should join parts if the value is an array', () => {
      const parts = ['hello', { text: ' world' }];
      expect(partToString(parts, verboseOptions)).toBe('hello world');
    });

    it('should return the text property if the part is an object with text', () => {
      const part: Part = { text: 'hello world' };
      expect(partToString(part, verboseOptions)).toBe('hello world');
    });

    it('should return descriptive string for videoMetadata part', () => {
      const part = { videoMetadata: {} } as Part;
      expect(partToString(part, verboseOptions)).toBe('[Video Metadata]');
    });

    it('should return descriptive string for thought part', () => {
      const part = { thought: 'thinking' } as unknown as Part;
      expect(partToString(part, verboseOptions)).toBe('[Thought: thinking]');
    });

    it('should return descriptive string for codeExecutionResult part', () => {
      const part = { codeExecutionResult: {} } as Part;
      expect(partToString(part, verboseOptions)).toBe(
        '[Code Execution Result]',
      );
    });

    it('should return descriptive string for executableCode part', () => {
      const part = { executableCode: {} } as Part;
      expect(partToString(part, verboseOptions)).toBe('[Executable Code]');
    });

    it('should return descriptive string for fileData part', () => {
      const part = { fileData: {} } as Part;
      expect(partToString(part, verboseOptions)).toBe('[File Data]');
    });

    it('should return descriptive string for functionCall part', () => {
      const part = { functionCall: { name: 'myFunction' } } as Part;
      expect(partToString(part, verboseOptions)).toBe(
        '[Function Call: myFunction]',
      );
    });

    it('should return descriptive string for functionResponse part', () => {
      const part = { functionResponse: { name: 'myFunction' } } as Part;
      expect(partToString(part, verboseOptions)).toBe(
        '[Function Response: myFunction]',
      );
    });

    it('should return descriptive string for inlineData part', () => {
      const part = { inlineData: { mimeType: 'image/png', data: '' } } as Part;
      expect(partToString(part, verboseOptions)).toBe('[Image: image/png]');
    });

    it('should return an empty string for an unknown part type', () => {
      const part: Part = {};
      expect(partToString(part, verboseOptions)).toBe('');
    });

    it('should handle complex nested arrays with various part types', () => {
      const parts = [
        'start ',
        { text: 'middle' },
        [
          { functionCall: { name: 'func1' } },
          ' end',
          { inlineData: { mimeType: 'audio/mp3', data: '' } },
        ],
      ];
      expect(partToString(parts as Part, verboseOptions)).toBe(
        'start middle[Function Call: func1] end[Audio: audio/mp3]',
      );
    });
  });

  describe('getResponseText', () => {
    it('should return null when no candidates exist', () => {
      const response = mockResponse(undefined);
      expect(getResponseText(response)).toBeNull();
    });

    it('should return concatenated text from first candidate', () => {
      const result = mockResponse([{ text: 'a' }, { text: 'b' }]);
      expect(getResponseText(result)).toBe('ab');
    });

    it('should ignore parts without text', () => {
      const result = mockResponse([{ functionCall: {} }, { text: 'hello' }]);
      expect(getResponseText(result)).toBe('hello');
    });

    it('should return null when candidate has no parts', () => {
      const result = mockResponse([]);
      expect(getResponseText(result)).toBeNull();
    });

    it('should return null if the first candidate has no content property', () => {
      const response: GenerateContentResponse = {
        candidates: [
          {
            index: 0,
          },
        ],
        promptFeedback: { safetyRatings: [] },
        text: undefined,
        data: undefined,
        functionCalls: undefined,
        executableCode: undefined,
        codeExecutionResult: undefined,
      };
      expect(getResponseText(response)).toBeNull();
    });
  });

  describe('flatMapTextParts', () => {
    // A simple async transform function that splits a string into character parts.
    const splitCharsTransform = async (text: string): Promise<PartUnion[]> =>
      text.split('').map((char) => ({ text: char }));

    it('should return an empty array for empty input', async () => {
      const result = await flatMapTextParts([], splitCharsTransform);
      expect(result).toEqual([]);
    });

    it('should transform a simple string input', async () => {
      const result = await flatMapTextParts('hi', splitCharsTransform);
      expect(result).toEqual([{ text: 'h' }, { text: 'i' }]);
    });

    it('should transform a single text part object', async () => {
      const result = await flatMapTextParts(
        { text: 'cat' },
        splitCharsTransform,
      );
      expect(result).toEqual([{ text: 'c' }, { text: 'a' }, { text: 't' }]);
    });

    it('should transform an array of text parts and flatten the result', async () => {
      // A transform that duplicates the text to test the "flatMap" behavior.
      const duplicateTransform = async (text: string): Promise<PartUnion[]> => [
        { text: `${text}` },
        { text: `${text}` },
      ];
      const parts = [{ text: 'a' }, { text: 'b' }];
      const result = await flatMapTextParts(parts, duplicateTransform);
      expect(result).toEqual([
        { text: 'a' },
        { text: 'a' },
        { text: 'b' },
        { text: 'b' },
      ]);
    });

    it('should pass through non-text parts unmodified', async () => {
      const nonTextPart: Part = { functionCall: { name: 'do_stuff' } };
      const result = await flatMapTextParts(nonTextPart, splitCharsTransform);
      expect(result).toEqual([nonTextPart]);
    });

    it('should handle a mix of text and non-text parts in an array', async () => {
      const nonTextPart: Part = {
        inlineData: { mimeType: 'image/jpeg', data: '' },
      };
      const parts: PartUnion[] = [{ text: 'go' }, nonTextPart, ' stop'];
      const result = await flatMapTextParts(parts, splitCharsTransform);
      expect(result).toEqual([
        { text: 'g' },
        { text: 'o' },
        nonTextPart, // Should be passed through
        { text: ' ' },
        { text: 's' },
        { text: 't' },
        { text: 'o' },
        { text: 'p' },
      ]);
    });

    it('should handle a transform that returns an empty array', async () => {
      const removeTransform = async (_text: string): Promise<PartUnion[]> => [];
      const parts: PartUnion[] = [
        { text: 'remove' },
        { functionCall: { name: 'keep' } },
      ];
      const result = await flatMapTextParts(parts, removeTransform);
      expect(result).toEqual([{ functionCall: { name: 'keep' } }]);
    });
  });

  describe('base64ByteSize', () => {
    it('should compute byte size for unpadded base64', () => {
      // 4 base64 chars = 3 bytes (no padding)
      expect(base64ByteSize('AAAA')).toBe(3);
    });

    it('should account for single padding character', () => {
      // 4 base64 chars with "=" padding = 2 bytes
      expect(base64ByteSize('AAA=')).toBe(2);
    });

    it('should account for double padding characters', () => {
      // 4 base64 chars with "==" padding = 1 byte
      expect(base64ByteSize('AA==')).toBe(1);
    });

    it('should handle empty string', () => {
      expect(base64ByteSize('')).toBe(0);
    });

    it('should compute correct size for larger data', () => {
      // 8 base64 chars = 6 bytes
      expect(base64ByteSize('AAAAAAAA')).toBe(6);
      // 12 base64 chars with '==' padding = floor(12*3/4) - 2 = 7 bytes
      expect(base64ByteSize('AAAAAAAAAA==')).toBe(7);
    });
  });

  describe('describeInlineData', () => {
    // Helper: create a base64 string of approximately N raw bytes.
    // base64 encodes 3 bytes per 4 chars, so we need ceil(N/3)*4 chars.
    function makeBase64(rawBytes: number): string {
      const chars = Math.ceil(rawBytes / 3) * 4;
      return 'A'.repeat(chars);
    }

    describe('audio descriptions', () => {
      it('should describe audio with MIME type only when data is empty', () => {
        expect(describeInlineData('audio/mp3', '')).toBe('[Audio: audio/mp3]');
      });

      it('should describe audio with MIME type only when data is undefined', () => {
        expect(describeInlineData('audio/mp3', undefined)).toBe(
          '[Audio: audio/mp3]',
        );
      });

      it('should include size and duration for mp3 audio', () => {
        // 16000 bytes at 16000 bytes/sec (128 kbps) = ~1.0s
        const data = makeBase64(16000);
        const result = describeInlineData('audio/mp3', data);
        expect(result).toMatch(/^\[Audio: audio\/mp3, [\d.]+ KB, ~[\d.]+s\]$/);
      });

      it('should include size and duration for wav audio', () => {
        const data = makeBase64(176400);
        const result = describeInlineData('audio/wav', data);
        expect(result).toMatch(/^\[Audio: audio\/wav, [\d.]+ KB, ~[\d.]+s\]$/);
      });

      it('should include size and duration for ogg audio', () => {
        const data = makeBase64(32000);
        const result = describeInlineData('audio/ogg', data);
        expect(result).toMatch(/^\[Audio: audio\/ogg, [\d.]+ KB, ~[\d.]+s\]$/);
      });

      it('should include size and duration for opus audio', () => {
        const data = makeBase64(8000);
        const result = describeInlineData('audio/opus', data);
        expect(result).toMatch(/^\[Audio: audio\/opus, [\d.]+ KB, ~[\d.]+s\]$/);
      });

      it('should include size and duration for webm audio', () => {
        const data = makeBase64(16000);
        const result = describeInlineData('audio/webm', data);
        expect(result).toMatch(/^\[Audio: audio\/webm, [\d.]+ KB, ~[\d.]+s\]$/);
      });

      it('should include size and duration for aac audio', () => {
        const data = makeBase64(16000);
        const result = describeInlineData('audio/aac', data);
        expect(result).toMatch(/^\[Audio: audio\/aac, [\d.]+ KB, ~[\d.]+s\]$/);
      });

      it('should include size and duration for flac audio', () => {
        const data = makeBase64(88200);
        const result = describeInlineData('audio/flac', data);
        expect(result).toMatch(/^\[Audio: audio\/flac, [\d.]+ KB, ~[\d.]+s\]$/);
      });

      it('should include size and duration for mpeg audio', () => {
        const data = makeBase64(16000);
        const result = describeInlineData('audio/mpeg', data);
        expect(result).toMatch(/^\[Audio: audio\/mpeg, [\d.]+ KB, ~[\d.]+s\]$/);
      });

      it('should show size but no duration for unknown audio codec', () => {
        const data = makeBase64(10000);
        const result = describeInlineData('audio/x-custom', data);
        expect(result).toMatch(/^\[Audio: audio\/x-custom, [\d.]+ KB\]$/);
        expect(result).not.toContain('~');
      });

      it('should format duration as minutes and seconds for long audio', () => {
        // 120 seconds of mp3: 120 * 16000 = 1,920,000 bytes
        const data = makeBase64(1920000);
        const result = describeInlineData('audio/mp3', data);
        expect(result).toMatch(/\d+m \d+s/);
      });
    });

    describe('video descriptions', () => {
      it('should describe video with MIME type only when data is empty', () => {
        expect(describeInlineData('video/mp4', '')).toBe('[Video: video/mp4]');
      });

      it('should include size and duration for mp4 video', () => {
        const data = makeBase64(375000);
        const result = describeInlineData('video/mp4', data);
        expect(result).toMatch(/^\[Video: video\/mp4, [\d.]+ KB, ~[\d.]+s\]$/);
      });

      it('should include size and duration for webm video', () => {
        const data = makeBase64(312500);
        const result = describeInlineData('video/webm', data);
        expect(result).toMatch(/^\[Video: video\/webm, [\d.]+ KB, ~[\d.]+s\]$/);
      });

      it('should include size and duration for quicktime video', () => {
        const data = makeBase64(375000);
        const result = describeInlineData('video/quicktime', data);
        expect(result).toMatch(
          /^\[Video: video\/quicktime, [\d.]+ KB, ~[\d.]+s\]$/,
        );
      });

      it('should show size but no duration for unknown video codec', () => {
        const data = makeBase64(50000);
        const result = describeInlineData('video/x-matroska', data);
        expect(result).toMatch(/^\[Video: video\/x-matroska, [\d.]+ KB\]$/);
        expect(result).not.toContain('~');
      });

      it('should format large video size in MB', () => {
        // 5 MB video
        const data = makeBase64(5 * 1024 * 1024);
        const result = describeInlineData('video/mp4', data);
        expect(result).toContain('MB');
      });
    });

    describe('image descriptions', () => {
      it('should describe image with MIME type only when data is empty', () => {
        expect(describeInlineData('image/png', '')).toBe('[Image: image/png]');
      });

      it('should include size for image with data', () => {
        const data = makeBase64(50000);
        const result = describeInlineData('image/png', data);
        expect(result).toMatch(/^\[Image: image\/png, [\d.]+ KB\]$/);
      });

      it('should not include duration estimate for images', () => {
        const data = makeBase64(50000);
        const result = describeInlineData('image/jpeg', data);
        expect(result).not.toContain('~');
      });
    });

    describe('PDF descriptions', () => {
      it('should describe PDF without MIME type label', () => {
        expect(describeInlineData('application/pdf', '')).toBe('[PDF]');
      });

      it('should include size for PDF with data', () => {
        const data = makeBase64(100000);
        const result = describeInlineData('application/pdf', data);
        expect(result).toMatch(/^\[PDF, [\d.]+ KB\]$/);
      });
    });

    describe('other/unknown types', () => {
      it('should describe unknown MIME type with Data label', () => {
        expect(describeInlineData('application/octet-stream', '')).toBe(
          '[Data: application/octet-stream]',
        );
      });

      it('should handle undefined MIME type', () => {
        expect(describeInlineData(undefined, '')).toBe('[Data: unknown]');
      });

      it('should handle both undefined MIME type and data', () => {
        expect(describeInlineData(undefined, undefined)).toBe(
          '[Data: unknown]',
        );
      });

      it('should include size for unknown type with data', () => {
        const data = makeBase64(512);
        const result = describeInlineData('application/octet-stream', data);
        expect(result).toMatch(/^\[Data: application\/octet-stream, \d+ B\]$/);
      });
    });

    describe('size formatting', () => {
      it('should format small sizes in bytes', () => {
        const data = makeBase64(500);
        const result = describeInlineData('application/octet-stream', data);
        expect(result).toMatch(/\d+ B/);
      });

      it('should format medium sizes in KB', () => {
        const data = makeBase64(50000);
        const result = describeInlineData('application/octet-stream', data);
        expect(result).toMatch(/[\d.]+ KB/);
      });

      it('should format large sizes in MB', () => {
        const data = makeBase64(2 * 1024 * 1024);
        const result = describeInlineData('application/octet-stream', data);
        expect(result).toMatch(/[\d.]+ MB/);
      });
    });
  });

  describe('appendToLastTextPart', () => {
    it('should append to an empty prompt', () => {
      const prompt: PartUnion[] = [];
      const result = appendToLastTextPart(prompt, 'new text');
      expect(result).toEqual([{ text: 'new text' }]);
    });

    it('should append to a prompt with a string as the last part', () => {
      const prompt: PartUnion[] = ['first part'];
      const result = appendToLastTextPart(prompt, 'new text');
      expect(result).toEqual(['first part\n\nnew text']);
    });

    it('should append to a prompt with a text part object as the last part', () => {
      const prompt: PartUnion[] = [{ text: 'first part' }];
      const result = appendToLastTextPart(prompt, 'new text');
      expect(result).toEqual([{ text: 'first part\n\nnew text' }]);
    });

    it('should append a new text part if the last part is not a text part', () => {
      const nonTextPart: Part = { functionCall: { name: 'do_stuff' } };
      const prompt: PartUnion[] = [nonTextPart];
      const result = appendToLastTextPart(prompt, 'new text');
      expect(result).toEqual([nonTextPart, { text: '\n\nnew text' }]);
    });

    it('should not append anything if the text to append is empty', () => {
      const prompt: PartUnion[] = ['first part'];
      const result = appendToLastTextPart(prompt, '');
      expect(result).toEqual(['first part']);
    });

    it('should use a custom separator', () => {
      const prompt: PartUnion[] = ['first part'];
      const result = appendToLastTextPart(prompt, 'new text', '---');
      expect(result).toEqual(['first part---new text']);
    });
  });
});
