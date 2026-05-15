/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalModelService } from './localModelService.js';
import { AuthType } from '../core/contentGenerator.js';

describe('LocalModelService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('discovers models from the local backend models endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'gemma4:26b' }, { id: 'gemma4:e4b' }],
      }),
    });
    const service = new LocalModelService(fetchMock as unknown as typeof fetch);

    const models = await service.discoverModels(AuthType.USE_LOCAL_OLLAMA);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/v1/models',
      expect.any(Object),
    );
    expect(models.map((model) => model.id)).toEqual([
      'gemma4:26b',
      'gemma4:e4b',
    ]);
  });

  it('resolves the gemma4 alias to the preferred 26B model when available', () => {
    const service = new LocalModelService();
    const resolved = service.resolveModelName('gemma4', [
      { id: 'gemma4:e4b' },
      { id: 'gemma4:26b' },
      { id: 'gemma4:31b' },
    ]);

    expect(resolved).toBe('gemma4:26b');
  });

  it('returns the requested exact model ID when it is present', () => {
    const service = new LocalModelService();
    const resolved = service.resolveModelName('google/gemma-4-26b-a4b', [
      { id: 'google/gemma-4-26b-a4b' },
    ]);

    expect(resolved).toBe('google/gemma-4-26b-a4b');
  });

  it('honors explicit alias mappings when the mapped model is available', () => {
    const service = new LocalModelService();
    const resolved = service.resolveModelName(
      'gemma4',
      [{ id: 'google/gemma-4-26b-a4b' }, { id: 'gemma4:e4b' }],
      { gemma4: 'google/gemma-4-26b-a4b' },
    );

    expect(resolved).toBe('google/gemma-4-26b-a4b');
  });

  it('throws a helpful error when a Gemma 4 alias cannot be resolved', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'llama3.1:8b' }],
      }),
    });
    const service = new LocalModelService(fetchMock as unknown as typeof fetch);

    await expect(
      service.resolveModelId(AuthType.USE_LOCAL_OLLAMA, 'gemma4'),
    ).rejects.toThrow(/Available Gemma 4 models: none found/);
  });

  it('pingBackend returns true when backend responds ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const service = new LocalModelService(fetchMock as unknown as typeof fetch);

    const result = await service.pingBackend(AuthType.USE_LOCAL_OLLAMA);

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/v1/models',
      expect.any(Object),
    );
  });

  it('pingBackend returns false when backend responds with error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const service = new LocalModelService(fetchMock as unknown as typeof fetch);

    const result = await service.pingBackend(AuthType.USE_LOCAL_OLLAMA);

    expect(result).toBe(false);
  });

  it('pingBackend returns false on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Connection refused'));
    const service = new LocalModelService(fetchMock as unknown as typeof fetch);

    const result = await service.pingBackend(AuthType.USE_LOCAL_OLLAMA);

    expect(result).toBe(false);
  });

  it('pingBackend returns false for non-local auth type', async () => {
    const fetchMock = vi.fn();
    const service = new LocalModelService(fetchMock as unknown as typeof fetch);

    const result = await service.pingBackend(AuthType.USE_GEMINI);

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
