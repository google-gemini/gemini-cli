/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('LocalModelDiscoveryService Integration', () => {
  beforeEach(() => {
    vi.stubEnv('OLLAMA_HOST', '');
    vi.stubEnv('LM_STUDIO_API_BASE', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('discovers models, resolves metadata, and produces tuning settings', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/v1/models')) {
          return new Response(
            JSON.stringify({
              data: [{ id: 'gemma4:31b', object: 'model', owned_by: 'google' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (urlStr.includes('/api/show')) {
          return new Response(
            JSON.stringify({
              model_info: { totalParams: '30.7B' },
              details: { quantization_level: 'Q4_K_M' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not Found', { status: 404 });
      });

    const { LocalModelDiscoveryService } = await import(
      './localModelDiscoveryService.js'
    );
    const { AuthType } = await import('../core/contentGenerator.js');

    const discovery = new LocalModelDiscoveryService();
    const result = await discovery.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_OLLAMA],
    });

    expect(result.backends).toHaveLength(1);
    const backend = result.backends[0];
    expect(backend.authType).toBe(AuthType.USE_LOCAL_OLLAMA);
    expect(backend.gemma4Models.map((m) => m.id)).toContain('gemma4:31b');
    expect(backend.gemma4Metadata[0].paramSize).toBe('30.7B');
    expect(backend.gemma4Metadata[0].quantization).toBe('Q4_K_M');

    const tunings = await discovery.tuneBackendModels(backend);
    const tuning = tunings.get('gemma4:31b');
    expect(tuning).toBeDefined();
    expect(tuning?.enableThinking).toBe(true);
    expect(tuning?.thinkingMode).toBe('native-token');
    expect(tuning?.profile).toBe('large');

    fetchSpy.mockRestore();
  });

  it('handles mixed healthy/unhealthy backends and prefers the healthy one', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('11434/v1/models')) {
          // Ollama unhealthy
          return new Response('Not Found', { status: 404 });
        }
        if (urlStr.includes('1234/v1/models')) {
          // LM Studio healthy with Gemma 4
          return new Response(
            JSON.stringify({
              data: [{ id: 'gemma-4-31b-it', object: 'model' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not Found', { status: 404 });
      });

    const { LocalModelDiscoveryService } = await import(
      './localModelDiscoveryService.js'
    );
    const { AuthType } = await import('../core/contentGenerator.js');

    const discovery = new LocalModelDiscoveryService();
    const result = await discovery.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_OLLAMA, AuthType.USE_LOCAL_LM_STUDIO],
    });

    expect(result.backends).toHaveLength(1);
    expect(result.preferredBackend?.authType).toBe(
      AuthType.USE_LOCAL_LM_STUDIO,
    );

    fetchSpy.mockRestore();
  });

  it('uses custom base URLs from settings when available', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('ollama.custom.example.com:11434/v1/models')) {
          return new Response(
            JSON.stringify({
              data: [{ id: 'gemma4:26b', object: 'model' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not Found', { status: 404 });
      });

    const { LocalModelDiscoveryService } = await import(
      './localModelDiscoveryService.js'
    );
    const { AuthType } = await import('../core/contentGenerator.js');

    const discovery = new LocalModelDiscoveryService();
    const result = await discovery.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_OLLAMA],
      baseUrls: {
        ollama: 'http://ollama.custom.example.com:11434',
      },
    });

    expect(result.backends).toHaveLength(1);
    expect(result.backends[0].baseUrl).toBe(
      'http://ollama.custom.example.com:11434/v1',
    );

    fetchSpy.mockRestore();
  });

  it('discovers LM Studio models with org/name ID format', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('1234/v1/models')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'google/gemma-4-26b-a4b',
                  object: 'model',
                  owned_by: 'google',
                },
                { id: 'text-embedding-nomic-embed-text-v1.5', object: 'model' },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not Found', { status: 404 });
      });

    const { LocalModelDiscoveryService } = await import(
      './localModelDiscoveryService.js'
    );
    const { AuthType } = await import('../core/contentGenerator.js');

    const discovery = new LocalModelDiscoveryService();
    const result = await discovery.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_LM_STUDIO],
    });

    expect(result.backends).toHaveLength(1);
    const backend = result.backends[0];
    expect(backend.authType).toBe(AuthType.USE_LOCAL_LM_STUDIO);
    expect(backend.gemma4Models.map((m) => m.id)).toEqual([
      'google/gemma-4-26b-a4b',
    ]);
    expect(backend.gemma4Metadata).toHaveLength(1);
    expect(backend.gemma4Metadata[0].paramSize).toBeDefined();

    fetchSpy.mockRestore();
  });

  it('discovers 26B MoE model and produces correct tuning profile', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/v1/models')) {
          return new Response(
            JSON.stringify({
              data: [{ id: 'gemma4:26b', object: 'model', owned_by: 'google' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (urlStr.includes('/api/show')) {
          return new Response(
            JSON.stringify({
              model_info: { totalParams: '25.2B' },
              details: { quantization_level: 'Q4_K_M' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not Found', { status: 404 });
      });

    const { LocalModelDiscoveryService } = await import(
      './localModelDiscoveryService.js'
    );
    const { AuthType } = await import('../core/contentGenerator.js');

    const discovery = new LocalModelDiscoveryService();
    const result = await discovery.discoverBackends({
      authTypes: [AuthType.USE_LOCAL_OLLAMA],
    });

    expect(result.backends).toHaveLength(1);
    const backend = result.backends[0];
    expect(backend.gemma4Models.map((m) => m.id)).toContain('gemma4:26b');
    expect(backend.gemma4Metadata[0].paramSize).toBe('25.2B');

    const tunings = await discovery.tuneBackendModels(backend);
    const tuning = tunings.get('gemma4:26b');
    expect(tuning).toBeDefined();
    expect(tuning?.profile).toBe('medium');

    fetchSpy.mockRestore();
  });

  it('handles all 5 backends with no Gemma 4 models gracefully', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 'llama3', object: 'model' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { LocalModelDiscoveryService } = await import(
      './localModelDiscoveryService.js'
    );
    const { AuthType } = await import('../core/contentGenerator.js');

    const discovery = new LocalModelDiscoveryService();
    const result = await discovery.discoverBackends({
      authTypes: [
        AuthType.USE_LOCAL_OLLAMA,
        AuthType.USE_LOCAL_LM_STUDIO,
        AuthType.USE_LOCAL_LLAMA_CPP,
        AuthType.USE_LOCAL_VLLM,
        AuthType.USE_LOCAL_SGLANG,
      ],
    });

    for (const backend of result.backends) {
      expect(backend.gemma4Models).toHaveLength(0);
    }

    fetchSpy.mockRestore();
  });
});
