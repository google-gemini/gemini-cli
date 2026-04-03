/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThinkingLevel } from '@google/genai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promisify } from 'node:util';

const mockReaddir = vi.fn();
const mockExecFileAsync = vi.fn();
const mockExecFile = Object.assign(vi.fn(), {
  [promisify.custom]: mockExecFileAsync,
});

vi.mock('node:fs/promises', () => ({
  default: {},
  readdir: mockReaddir,
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

describe('ollamaGemma', () => {
  beforeEach(() => {
    vi.resetModules();
    mockReaddir.mockReset();
    mockExecFile.mockReset();
    mockExecFileAsync.mockReset();
  });

  it('discovers installed Gemma 4 variants with metadata', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'latest', isFile: () => true },
      { name: '31b', isFile: () => true },
      { name: 'e4b', isFile: () => true },
    ]);
    mockExecFileAsync.mockImplementation(
      async (_command: string, args: string[]) => {
        const modelId = args[1];
        if (modelId === 'gemma4:31b') {
          return {
            stdout: `  Model
    parameters          31.3B
    context length      262144

  Capabilities
    completion
    vision
    tools
    thinking
`,
            stderr: '',
          };
        }

        return {
          stdout: `  Model
    parameters          8.0B
    context length      131072

  Capabilities
    completion
    tools
    thinking
`,
          stderr: '',
        };
      },
    );

    const { discoverLocalGemmaModels } = await import('./ollamaGemma.js');
    const models = await discoverLocalGemmaModels();

    expect(models).toHaveLength(2);
    expect(models.map((model) => model.modelId)).toEqual([
      'gemma4:e4b',
      'gemma4:31b',
    ]);
    expect(models[0]).toMatchObject({
      displayName: 'Gemma 4 E4B',
      contextLength: 131072,
      capabilities: {
        completion: true,
        tools: true,
        thinking: true,
        vision: false,
      },
    });
    expect(models[1]).toMatchObject({
      displayName: 'Gemma 4 31B',
      contextLength: 262144,
      capabilities: {
        completion: true,
        tools: true,
        thinking: true,
        vision: true,
      },
    });
  });

  it('returns Gemma-specific compression defaults', async () => {
    const {
      createLocalGemmaModelAlias,
      getLocalGemmaCompressionThreshold,
      getLocalGemmaToolResponseBudget,
      getPreferredLocalGemmaModel,
      getPreferredLocalGemmaUtilityModel,
    } = await import('./ollamaGemma.js');

    expect(getLocalGemmaCompressionThreshold(131072)).toBe(0.25);
    expect(getLocalGemmaCompressionThreshold(262144)).toBe(0.35);
    expect(getLocalGemmaToolResponseBudget(131072)).toBe(19660);
    expect(getLocalGemmaToolResponseBudget(262144)).toBe(39321);
    expect(
      getPreferredLocalGemmaModel([
        {
          modelId: 'gemma4:e4b',
          variant: 'e4b',
          displayName: 'Gemma 4 E4B',
          dialogDescription: '',
          contextLength: 131072,
          capabilities: {
            completion: true,
            tools: true,
            thinking: true,
            vision: false,
            audio: false,
          },
        },
        {
          modelId: 'gemma4:31b',
          variant: '31b',
          displayName: 'Gemma 4 31B',
          dialogDescription: '',
          contextLength: 262144,
          capabilities: {
            completion: true,
            tools: true,
            thinking: true,
            vision: true,
            audio: false,
          },
        },
      ])?.modelId,
    ).toBe('gemma4:31b');
    expect(
      getPreferredLocalGemmaUtilityModel([
        {
          modelId: 'gemma4:e2b',
          variant: 'e2b',
          displayName: 'Gemma 4 E2B',
          dialogDescription: '',
          contextLength: 131072,
          capabilities: {
            completion: true,
            tools: true,
            thinking: true,
            vision: false,
            audio: false,
          },
        },
        {
          modelId: 'gemma4:e4b',
          variant: 'e4b',
          displayName: 'Gemma 4 E4B',
          dialogDescription: '',
          contextLength: 131072,
          capabilities: {
            completion: true,
            tools: true,
            thinking: true,
            vision: false,
            audio: false,
          },
        },
        {
          modelId: 'gemma4:31b',
          variant: '31b',
          displayName: 'Gemma 4 31B',
          dialogDescription: '',
          contextLength: 262144,
          capabilities: {
            completion: true,
            tools: true,
            thinking: true,
            vision: true,
            audio: false,
          },
        },
      ])?.modelId,
    ).toBe('gemma4:e4b');
    expect(
      createLocalGemmaModelAlias({
        modelId: 'gemma4:31b',
        variant: '31b',
        displayName: 'Gemma 4 31B',
        dialogDescription: '',
        contextLength: 262144,
        capabilities: {
          completion: true,
          tools: true,
          thinking: true,
          vision: true,
          audio: false,
        },
      }),
    ).toMatchObject({
      extends: 'chat-base',
      modelConfig: {
        model: 'gemma4:31b',
        generateContentConfig: {
          thinkingConfig: {
            includeThoughts: true,
            thinkingLevel: ThinkingLevel.HIGH,
          },
        },
      },
    });
  });
});
