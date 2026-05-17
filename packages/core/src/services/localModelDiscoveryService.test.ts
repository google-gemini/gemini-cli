/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthType } from '../core/contentGenerator.js';
import { LocalModelDiscoveryService } from './localModelDiscoveryService.js';
import { type LocalModelService } from './localModelService.js';

describe('LocalModelDiscoveryService', () => {
  beforeEach(() => {
    vi.stubEnv('OLLAMA_HOST', '');
    vi.stubEnv('LM_STUDIO_API_BASE', '');
    vi.stubEnv('LLAMA_CPP_SERVER_BASE', '');
    vi.stubEnv('VLLM_API_BASE', '');
    vi.stubEnv('SGLANG_API_BASE', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers the first configured backend with Gemma 4 models', async () => {
    const localModelService = {
      discoverModels: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'gemma4:26b' }, { id: 'gemma4:e4b' }])
        .mockResolvedValueOnce([{ id: 'google/gemma-4-27b-it' }]),
      filterGemma4Models: vi
        .fn()
        .mockImplementation((models: Array<{ id: string }>) => models),
      fetch: vi.fn(),
    } as unknown as LocalModelService;

    const service = new LocalModelDiscoveryService(localModelService);
    const result = await service.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_OLLAMA, AuthType.USE_LOCAL_LM_STUDIO],
    });

    expect(result.backends).toHaveLength(2);
    expect(result.preferredBackend?.authType).toBe(AuthType.USE_LOCAL_OLLAMA);
    expect(localModelService.discoverModels).toHaveBeenCalledWith(
      AuthType.USE_LOCAL_OLLAMA,
      'http://localhost:11434/v1',
    );
  });

  it('skips backends that do not expose Gemma 4 models', async () => {
    const localModelService = {
      discoverModels: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'llama3.1:8b' }])
        .mockResolvedValueOnce([{ id: 'gemma4:26b' }]),
      filterGemma4Models: vi
        .fn()
        .mockImplementation((models: Array<{ id: string }>) =>
          models.filter((model) => model.id.includes('gemma4')),
        ),
      fetch: vi.fn(),
    } as unknown as LocalModelService;

    const service = new LocalModelDiscoveryService(localModelService);
    const result = await service.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_OLLAMA, AuthType.USE_LOCAL_LM_STUDIO],
    });

    expect(result.backends).toHaveLength(1);
    expect(result.preferredBackend?.authType).toBe(
      AuthType.USE_LOCAL_LM_STUDIO,
    );
  });

  it('uses configured provider base urls during discovery', async () => {
    const localModelService = {
      discoverModels: vi.fn().mockResolvedValue([{ id: 'gemma4:26b' }]),
      filterGemma4Models: vi
        .fn()
        .mockImplementation((models: Array<{ id: string }>) => models),
      fetch: vi.fn(),
    } as unknown as LocalModelService;

    const service = new LocalModelDiscoveryService(localModelService);
    await service.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_OLLAMA],
      baseUrls: {
        ollama: 'http://ollama.internal:21434',
      },
    });

    expect(localModelService.discoverModels).toHaveBeenCalledWith(
      AuthType.USE_LOCAL_OLLAMA,
      'http://ollama.internal:21434/v1',
    );
  });

  it('treats discovery failures as non-blocking', async () => {
    const localModelService = {
      discoverModels: vi
        .fn()
        .mockRejectedValueOnce(new Error('connection refused'))
        .mockResolvedValueOnce([{ id: 'gemma4:26b' }]),
      filterGemma4Models: vi
        .fn()
        .mockImplementation((models: Array<{ id: string }>) => models),
      fetch: vi.fn(),
    } as unknown as LocalModelService;

    const service = new LocalModelDiscoveryService(localModelService);
    const result = await service.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_OLLAMA, AuthType.USE_LOCAL_LM_STUDIO],
    });

    expect(result.backends).toHaveLength(1);
    expect(result.preferredBackend?.authType).toBe(
      AuthType.USE_LOCAL_LM_STUDIO,
    );
  });

  it('fetches Ollama metadata via /api/show and populates gemma4Metadata', async () => {
    const localModelService = {
      discoverModels: vi.fn().mockResolvedValue([{ id: 'gemma4:31b' }]),
      filterGemma4Models: vi
        .fn()
        .mockImplementation((models: Array<{ id: string }>) => models),
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model_info: { totalParams: '30.7B' },
            details: { quantization_level: 'Q4_K_M' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    } as unknown as LocalModelService;

    const service = new LocalModelDiscoveryService(localModelService);
    const result = await service.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_OLLAMA],
    });

    expect(result.backends).toHaveLength(1);
    expect(result.backends[0].gemma4Metadata).toHaveLength(1);
    expect(result.backends[0].gemma4Metadata[0].paramSize).toBe('30.7B');
    expect(result.backends[0].gemma4Metadata[0].quantization).toBe('Q4_K_M');
    expect(localModelService.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/show',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ name: 'gemma4:31b' }),
      }),
    );
  });

  it('falls back to defaults when Ollama /api/show fails', async () => {
    const localModelService = {
      discoverModels: vi.fn().mockResolvedValue([{ id: 'gemma4:26b' }]),
      filterGemma4Models: vi
        .fn()
        .mockImplementation((models: Array<{ id: string }>) => models),
      fetch: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as LocalModelService;

    const service = new LocalModelDiscoveryService(localModelService);
    const result = await service.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_OLLAMA],
    });

    expect(result.backends).toHaveLength(1);
    expect(result.backends[0].gemma4Metadata[0].paramSize).toBe('25.2B');
    expect(result.backends[0].gemma4Metadata[0].quantization).toBe('Q4_K_M');
  });

  it('non-Ollama backends skip /api/show and use defaults', async () => {
    const localModelService = {
      discoverModels: vi.fn().mockResolvedValue([{ id: 'gemma-4-31b-it' }]),
      filterGemma4Models: vi
        .fn()
        .mockImplementation((models: Array<{ id: string }>) => models),
      fetch: vi.fn(),
    } as unknown as LocalModelService;

    const service = new LocalModelDiscoveryService(localModelService);
    const result = await service.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_LM_STUDIO],
    });

    expect(result.backends).toHaveLength(1);
    expect(result.backends[0].gemma4Metadata[0].paramSize).toBe('30.7B');
    expect(localModelService.fetch).not.toHaveBeenCalled();
  });

  it('tuneBackendModels produces correct tuning settings', async () => {
    const localModelService = {
      discoverModels: vi.fn().mockResolvedValue([{ id: 'gemma4:31b' }]),
      filterGemma4Models: vi
        .fn()
        .mockImplementation((models: Array<{ id: string }>) => models),
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model_info: { totalParams: '30.7B' },
            details: { quantization_level: 'Q4_K_M' },
          }),
          { status: 200 },
        ),
      ),
    } as unknown as LocalModelService;

    const service = new LocalModelDiscoveryService(localModelService);
    const result = await service.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_OLLAMA],
    });

    const tunings = await service.tuneBackendModels(result.backends[0]);
    const tuning = tunings.get('gemma4:31b');
    expect(tuning).toBeDefined();
    expect(tuning).toMatchObject({
      enableThinking: true,
      thinkingMode: 'native-token',
      profile: 'large',
      batchTools: true,
      prefetchContext: false,
    });
  });

  it('chooses preferred backend with more Gemma 4 models', async () => {
    const localModelService = {
      discoverModels: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'gemma4:26b' }, { id: 'gemma4:31b' }])
        .mockResolvedValueOnce([{ id: 'gemma4:31b' }]),
      filterGemma4Models: vi
        .fn()
        .mockImplementation((models: Array<{ id: string }>) => models),
      fetch: vi.fn(),
    } as unknown as LocalModelService;

    const service = new LocalModelDiscoveryService(localModelService);
    const result = await service.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_OLLAMA, AuthType.USE_LOCAL_LM_STUDIO],
    });

    expect(result.preferredBackend?.authType).toBe(AuthType.USE_LOCAL_OLLAMA);
    expect(result.preferredBackend?.gemma4Models).toHaveLength(2);
  });
});
