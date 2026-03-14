/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';

import type { GenerateImageParams } from './generate-image.js';
import {
  GenerateImageTool,
  promptToFilename,
  getUniqueFilename,
  validateOutputPath,
} from './generate-image.js';
import type { Config } from '../config/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

// Mock the @google/genai module
const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
}));

// Mock node:fs - must handle both default and named exports
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      statSync: vi.fn(),
      mkdirSync: vi.fn(),
      promises: {
        ...actual.promises,
        readFile: vi.fn(),
        writeFile: vi.fn(),
      },
    },
    existsSync: vi.fn(),
    statSync: vi.fn(),
    mkdirSync: vi.fn(),
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  };
});

const FAKE_CWD = '/fake/project';
// Valid base64 image data (no padding chars in the middle, >1000 chars)
const FAKE_BASE64_IMAGE = 'A'.repeat(2000);

function createMockConfig(): Config {
  return {
    getTargetDir: () => FAKE_CWD,
    getContentGeneratorConfig: () => ({
      apiKey: 'test-api-key',
      authType: 'gemini-api-key',
    }),
  } as unknown as Config;
}

function mockSuccessResponse() {
  return {
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: {
                data: FAKE_BASE64_IMAGE,
                mimeType: 'image/png',
              },
            },
          ],
        },
      },
    ],
  };
}

describe('GenerateImageTool', () => {
  let tool: GenerateImageTool;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = createMockConfig();
    tool = new GenerateImageTool(mockConfig, createMockMessageBus());
    mockGenerateContent.mockReset();

    // Default: output dir doesn't exist (will be created), files don't exist
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('build / parameter validation', () => {
    it('should return an invocation for a valid prompt', () => {
      const params: GenerateImageParams = { prompt: 'a sunset over the ocean' };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(params);
    });

    it('should throw for an empty prompt', () => {
      expect(() => tool.build({ prompt: '' })).toThrow(
        "The 'prompt' parameter cannot be empty.",
      );
    });

    it('should throw for a whitespace-only prompt', () => {
      expect(() => tool.build({ prompt: '   ' })).toThrow(
        "The 'prompt' parameter cannot be empty.",
      );
    });

    it('should throw if count is below 1', () => {
      expect(() => tool.build({ prompt: 'test', count: 0 })).toThrow();
    });

    it('should throw if count is above 4', () => {
      expect(() => tool.build({ prompt: 'test', count: 5 })).toThrow();
    });

    it('should accept valid count values', () => {
      expect(tool.build({ prompt: 'test', count: 1 })).toBeDefined();
      expect(tool.build({ prompt: 'test', count: 4 })).toBeDefined();
    });

    it('should reject output_path outside cwd', () => {
      expect(() =>
        tool.build({ prompt: 'test', output_path: '/other/dir' }),
      ).toThrow('Output path must be within the current working directory.');
    });

    it('should accept output_path within cwd', () => {
      const invocation = tool.build({
        prompt: 'test',
        output_path: 'my-images',
      });
      expect(invocation).toBeDefined();
    });
  });

  describe('getDescription', () => {
    it('should show generation mode for text-to-image', () => {
      const invocation = tool.build({ prompt: 'a sunset' });
      expect(invocation.getDescription()).toContain('Generate image');
      expect(invocation.getDescription()).toContain('a sunset');
    });

    it('should show edit mode with source path when input_image is provided', () => {
      const invocation = tool.build({
        prompt: 'make it blue',
        input_image: '/fake/img.png',
      });
      const desc = invocation.getDescription();
      expect(desc).toContain('Edit image');
      expect(desc).toContain('Source:  /fake/img.png');
    });

    it('should show optional params when provided', () => {
      const invocation = tool.build({
        prompt: 'test',
        count: 3,
        aspect_ratio: '16:9',
        size: '2K',
      });
      const desc = invocation.getDescription();
      expect(desc).toContain('Count:   3');
      expect(desc).toContain('Ratio: 16:9');
      expect(desc).toContain('Size:    2K');
    });

    it('should show default 1:1 aspect ratio for text-to-image', () => {
      const invocation = tool.build({ prompt: 'test' });
      const desc = invocation.getDescription();
      expect(desc).toContain('Ratio: 1:1');
    });

    it('should omit aspect ratio for edit mode when not provided', () => {
      const invocation = tool.build({
        prompt: 'make it blue',
        input_image: '/fake/img.png',
      });
      const desc = invocation.getDescription();
      expect(desc).not.toContain('Ratio:');
    });

    it('should omit count and size when not provided', () => {
      const invocation = tool.build({ prompt: 'test' });
      const desc = invocation.getDescription();
      expect(desc).not.toContain('Count:');
      expect(desc).not.toContain('Size:');
    });

    it('should truncate long prompts in description', () => {
      const longPrompt = 'a'.repeat(100);
      const invocation = tool.build({ prompt: longPrompt });
      const desc = invocation.getDescription();
      expect(desc).toContain('...');
    });
  });

  describe('execute', () => {
    it('should return cancel result when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const invocation = tool.build({ prompt: 'test' });
      const result = await invocation.execute(controller.signal);
      expect(result.llmContent).toBe('Image generation cancelled.');
    });

    it('should generate an image successfully', async () => {
      mockGenerateContent.mockResolvedValue(mockSuccessResponse());

      const invocation = tool.build({ prompt: 'a cute cat' });
      const signal = new AbortController().signal;
      const result = await invocation.execute(signal);

      expect(result.llmContent).toContain('Successfully generated 1 image(s)');
      expect(result.returnDisplay).toContain('Generated 1 image(s)');
      expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalled();
    });

    it('should return error when API returns no image data', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: 'just text, no image' }],
            },
          },
        ],
      });

      const invocation = tool.build({ prompt: 'test' });
      const signal = new AbortController().signal;
      const result = await invocation.execute(signal);

      expect(result.llmContent).toContain('No image data in API response');
    });

    it('should handle API auth errors', async () => {
      mockGenerateContent.mockRejectedValue(new Error('api key not valid'));

      const invocation = tool.build({ prompt: 'test' });
      const signal = new AbortController().signal;
      const result = await invocation.execute(signal);

      expect(result.llmContent).toContain('Authentication error');
    });

    it('should handle safety filter errors', async () => {
      mockGenerateContent.mockRejectedValue(
        new Error('Content was blocked by safety filters'),
      );

      const invocation = tool.build({ prompt: 'test' });
      const signal = new AbortController().signal;
      const result = await invocation.execute(signal);

      expect(result.llmContent).toContain('safety filters');
    });

    it('should validate input image existence during execute', async () => {
      // existsSync returns false for everything including the input image
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const invocation = tool.build({
        prompt: 'edit this',
        input_image: '/fake/missing.png',
      });
      const signal = new AbortController().signal;
      const result = await invocation.execute(signal);

      expect(result.llmContent).toContain('Input image not found');
    });

    it('should include inlineData when return_to_context is true', async () => {
      mockGenerateContent.mockResolvedValue(mockSuccessResponse());

      const invocation = tool.build({
        prompt: 'a cat',
        return_to_context: true,
      });
      const signal = new AbortController().signal;
      const result = await invocation.execute(signal);

      expect(Array.isArray(result.llmContent)).toBe(true);
      const parts = result.llmContent as Array<Record<string, unknown>>;
      expect(parts).toHaveLength(2);
      expect(parts[1]).toHaveProperty('inlineData');
    });

    it('should stream progress for batch generation', async () => {
      mockGenerateContent.mockResolvedValue(mockSuccessResponse());

      const updateOutput = vi.fn();
      const invocation = tool.build({ prompt: 'test', count: 2 });
      const signal = new AbortController().signal;
      await invocation.execute(signal, updateOutput);

      expect(updateOutput).toHaveBeenCalledWith(
        expect.stringContaining('Generating image 1 of 2'),
      );
    });

    it('should handle partial success in batch generation', async () => {
      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse())
        .mockRejectedValueOnce(new Error('quota exceeded'));

      const invocation = tool.build({ prompt: 'test', count: 2 });
      const signal = new AbortController().signal;
      const result = await invocation.execute(signal);

      expect(result.llmContent).toContain('Successfully generated 1 image(s)');
      expect(result.llmContent).toContain('Warnings');
    });

    it('should abort batch immediately on auth error', async () => {
      mockGenerateContent.mockRejectedValue(new Error('api key not valid'));

      const invocation = tool.build({ prompt: 'test', count: 3 });
      const signal = new AbortController().signal;
      const result = await invocation.execute(signal);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(result.llmContent).toContain('Authentication error');
    });

    it('should handle text fallback response parsing', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: FAKE_BASE64_IMAGE }],
            },
          },
        ],
      });

      const invocation = tool.build({ prompt: 'test' });
      const signal = new AbortController().signal;
      const result = await invocation.execute(signal);

      expect(result.llmContent).toContain('Successfully generated 1 image(s)');
    });
  });
});

describe('promptToFilename', () => {
  it('should convert prompt to lowercase with underscores', () => {
    expect(promptToFilename('A Sunset Over The Ocean')).toBe(
      'a_sunset_over_the_ocean',
    );
  });

  it('should remove special characters', () => {
    expect(promptToFilename('hello! @world #2024')).toBe('hello_world_2024');
  });

  it('should truncate to 32 characters', () => {
    const longPrompt = 'a'.repeat(50);
    expect(promptToFilename(longPrompt).length).toBe(32);
  });

  it('should return default name for empty result', () => {
    expect(promptToFilename('!!!')).toBe('generated_image');
  });
});

describe('getUniqueFilename', () => {
  it('should return simple filename when no file exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(getUniqueFilename('/dir', 'test', '.png')).toBe('test.png');
  });

  it('should add variation index for batch', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(getUniqueFilename('/dir', 'test', '.png', 0)).toBe('test.png');
    expect(getUniqueFilename('/dir', 'test', '.png', 1)).toBe('test_v2.png');
    expect(getUniqueFilename('/dir', 'test', '.png', 2)).toBe('test_v3.png');
  });

  it('should auto-increment when file exists', () => {
    vi.mocked(fs.existsSync)
      .mockReturnValueOnce(true) // test.png exists
      .mockReturnValueOnce(false); // test_1.png doesn't exist
    expect(getUniqueFilename('/dir', 'test', '.png')).toBe('test_1.png');
  });
});

describe('validateOutputPath', () => {
  it('should accept paths within cwd', () => {
    expect(validateOutputPath('images', '/project')).toBeNull();
    expect(validateOutputPath('./output', '/project')).toBeNull();
  });

  it('should reject paths outside cwd', () => {
    expect(validateOutputPath('/other/dir', '/project')).toContain(
      'within the current working directory',
    );
    expect(validateOutputPath('../outside', '/project')).toContain(
      'within the current working directory',
    );
  });
});
