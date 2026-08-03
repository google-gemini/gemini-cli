/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WhisperModelManager } from './whisperModelManager.js';

const { homeDirectory } = vi.hoisted(() => ({
  homeDirectory: { value: '' },
}));

vi.mock('../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths.js')>();
  return {
    ...actual,
    homedir: () => homeDirectory.value,
  };
});

describe('WhisperModelManager', () => {
  const modelName = 'ggml-tiny.en.bin';
  let testHome: string;
  let modelsDirectory: string;
  let modelPath: string;

  beforeEach(async () => {
    testHome = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-model-test-'));
    homeDirectory.value = testHome;
    modelsDirectory = path.join(testHome, '.gemini', 'whisper_models');
    modelPath = path.join(modelsDirectory, modelName);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await fs.rm(testHome, { recursive: true, force: true });
  });

  async function listTemporaryDownloads(): Promise<string[]> {
    try {
      return (await fs.readdir(modelsDirectory)).filter((file) =>
        file.endsWith('.downloading'),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return [];
      }
      throw error;
    }
  }

  it('publishes a model only after the complete response is written', async () => {
    const firstChunk = new Uint8Array([1, 2, 3]);
    const secondChunk = new Uint8Array([4, 5]);
    let releaseResponse: () => void = () => {};
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    let firstChunkSent = false;
    const responseBody = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (!firstChunkSent) {
          firstChunkSent = true;
          controller.enqueue(firstChunk);
          return;
        }

        await responseGate;
        controller.enqueue(secondChunk);
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(responseBody, {
          headers: { 'content-length': '5' },
        }),
      ),
    );
    const manager = new WhisperModelManager();
    const progress = vi.fn();
    manager.on('progress', progress);
    const firstProgress = new Promise<void>((resolve) => {
      manager.once('progress', () => resolve());
    });

    const download = manager.downloadModel(modelName);
    await firstProgress;

    expect(manager.isModelInstalled(modelName)).toBe(false);
    expect(await listTemporaryDownloads()).toHaveLength(1);

    releaseResponse();
    await download;

    expect(await fs.readFile(modelPath)).toEqual(Buffer.from([1, 2, 3, 4, 5]));
    expect(await listTemporaryDownloads()).toEqual([]);
    expect(progress).toHaveBeenLastCalledWith({
      modelName,
      transferred: 5,
      total: 5,
      percentage: 1,
    });
    expect(manager.isModelInstalled(modelName)).toBe(true);
  });

  it('rejects a response shorter than its content length and removes the temporary file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-length': '10' },
        }),
      ),
    );
    const manager = new WhisperModelManager();

    await expect(manager.downloadModel(modelName)).rejects.toThrow(
      'Incomplete model download: expected 10 bytes, received 3',
    );

    await expect(fs.stat(modelPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await listTemporaryDownloads()).toEqual([]);
    expect(manager.isModelInstalled(modelName)).toBe(false);
  });

  it('removes partial output when the response stream fails', async () => {
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.error(new Error('connection interrupted'));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(responseBody)),
    );
    const manager = new WhisperModelManager();

    await expect(manager.downloadModel(modelName)).rejects.toThrow(
      'connection interrupted',
    );

    await expect(fs.stat(modelPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await listTemporaryDownloads()).toEqual([]);
  });

  it('preserves an installed model when a replacement download fails', async () => {
    await fs.mkdir(modelsDirectory, { recursive: true });
    await fs.writeFile(modelPath, 'installed model');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2]), {
          headers: { 'content-length': '20' },
        }),
      ),
    );
    const manager = new WhisperModelManager();

    await expect(manager.downloadModel(modelName)).rejects.toThrow(
      'Incomplete model download',
    );

    expect(await fs.readFile(modelPath, 'utf8')).toBe('installed model');
    expect(await listTemporaryDownloads()).toEqual([]);
    expect(manager.isModelInstalled(modelName)).toBe(true);
  });

  it('does not treat a leftover temporary download as an installed model', async () => {
    await fs.mkdir(modelsDirectory, { recursive: true });
    await fs.writeFile(`${modelPath}.old.downloading`, 'partial model');

    const manager = new WhisperModelManager();

    expect(manager.isModelInstalled(modelName)).toBe(false);
  });
});
