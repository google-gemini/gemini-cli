/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  WhisperModelManager,
  type WhisperModelProgress,
} from './whisperModelManager.js';

const { createWriteStreamSpy } = vi.hoisted(() => ({
  createWriteStreamSpy: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    createWriteStream: (
      ...args: Parameters<typeof actual.createWriteStream>
    ) =>
      createWriteStreamSpy.getMockImplementation()
        ? createWriteStreamSpy(...args)
        : actual.createWriteStream(...args),
  };
});

function createMockResponse({
  ok = true,
  statusText = 'OK',
  contentLength,
  chunks,
  failAfterChunks,
  failureError = new Error('Network connection lost'),
  chunkDelayMs = 0,
}: {
  ok?: boolean;
  statusText?: string;
  contentLength?: number | null;
  chunks?: Uint8Array[];
  failAfterChunks?: number;
  failureError?: Error;
  chunkDelayMs?: number;
}): Response {
  let index = 0;
  const reader = {
    read: vi.fn(async () => {
      if (chunkDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, chunkDelayMs));
      }
      if (failAfterChunks !== undefined && index >= failAfterChunks) {
        throw failureError;
      }
      if (!chunks || index >= chunks.length) {
        return { done: true as const, value: undefined };
      }
      const value = chunks[index++];
      return { done: false as const, value };
    }),
    cancel: vi.fn(async () => {}),
  };

  return {
    ok,
    statusText,
    headers: new Headers(
      contentLength !== undefined && contentLength !== null
        ? { 'content-length': String(contentLength) }
        : {},
    ),
    body: chunks
      ? ({
          getReader: () => reader,
        } as unknown as ReadableStream<Uint8Array>)
      : null,
  } as unknown as Response;
}

describe('WhisperModelManager', () => {
  let tempHomeDir: string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'whisper-model-manager-test-'),
    );
    vi.stubEnv('GEMINI_CLI_HOME', tempHomeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it('validates allowed model names', () => {
    const manager = new WhisperModelManager();
    expect(() => manager.isModelInstalled('invalid-model.bin')).toThrow(
      'Unauthorized model name: invalid-model.bin',
    );
    expect(() => manager.getModelPath('invalid-model.bin')).toThrow(
      'Unauthorized model name: invalid-model.bin',
    );
  });

  it('rejects download for unauthorized model names', async () => {
    const manager = new WhisperModelManager();
    await expect(manager.downloadModel('invalid-model.bin')).rejects.toThrow(
      'Unauthorized model name: invalid-model.bin',
    );
  });

  it('downloads a model to a temporary file, emits progress, and atomically renames on completion', async () => {
    const chunk1 = new Uint8Array([1, 2, 3, 4]);
    const chunk2 = new Uint8Array([5, 6, 7, 8]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse({
        contentLength: 8,
        chunks: [chunk1, chunk2],
      }),
    );

    const manager = new WhisperModelManager();
    const modelName = 'ggml-tiny.en.bin';
    const progressEvents: WhisperModelProgress[] = [];
    const installedDuringProgress: boolean[] = [];

    manager.on('progress', (progress) => {
      progressEvents.push(progress);
      installedDuringProgress.push(manager.isModelInstalled(modelName));
    });

    expect(manager.isModelInstalled(modelName)).toBe(false);

    await manager.downloadModel(modelName);

    expect(installedDuringProgress).toEqual([false, false]);
    expect(progressEvents).toEqual([
      { modelName, transferred: 4, total: 8, percentage: 0.5 },
      { modelName, transferred: 8, total: 8, percentage: 1 },
    ]);
    expect(manager.isModelInstalled(modelName)).toBe(true);

    const modelPath = manager.getModelPath(modelName);
    expect(fs.readFileSync(modelPath)).toEqual(
      Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
    );
    expect(fs.existsSync(`${modelPath}.downloading`)).toBe(false);
  });

  it('does not leave a partial installed model or temporary file when the response stream fails mid-download', async () => {
    const chunk1 = new Uint8Array([1, 2, 3, 4]);
    const chunk2 = new Uint8Array([5, 6, 7, 8]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse({
        contentLength: 8,
        chunks: [chunk1, chunk2],
        failAfterChunks: 1,
        failureError: new Error('Connection reset by peer'),
        chunkDelayMs: 10,
      }),
    );

    const manager = new WhisperModelManager();
    const modelName = 'ggml-tiny.en.bin';
    const modelPath = manager.getModelPath(modelName);

    await expect(manager.downloadModel(modelName)).rejects.toThrow(
      'Connection reset by peer',
    );

    expect(manager.isModelInstalled(modelName)).toBe(false);
    expect(fs.existsSync(modelPath)).toBe(false);
    expect(fs.existsSync(`${modelPath}.downloading`)).toBe(false);
  });

  it('rejects and cleans up temporary file when stream ends before expected content-length', async () => {
    const chunk1 = new Uint8Array([1, 2, 3, 4]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse({
        contentLength: 100,
        chunks: [chunk1],
        chunkDelayMs: 10,
      }),
    );

    const manager = new WhisperModelManager();
    const modelName = 'ggml-tiny.en.bin';
    const modelPath = manager.getModelPath(modelName);

    await expect(manager.downloadModel(modelName)).rejects.toThrow(
      /Incomplete download/,
    );

    expect(manager.isModelInstalled(modelName)).toBe(false);
    expect(fs.existsSync(modelPath)).toBe(false);
    expect(fs.existsSync(`${modelPath}.downloading`)).toBe(false);
  });

  it('respects write stream backpressure and awaits close before marking model as installed', async () => {
    const chunk1 = new Uint8Array([1, 2, 3, 4]);
    const chunk2 = new Uint8Array([5, 6, 7, 8]);
    const response = createMockResponse({
      contentLength: 8,
      chunks: [chunk1, chunk2],
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

    const mockWriter = new EventEmitter() as EventEmitter & {
      write: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    const writtenChunks: Uint8Array[] = [];
    let tempFilePath = '';

    mockWriter.write = vi.fn((chunk: Uint8Array) => {
      writtenChunks.push(chunk);
      fs.appendFileSync(tempFilePath, Buffer.from(chunk));
      // Signal backpressure on first chunk
      return writtenChunks.length > 1;
    });
    mockWriter.end = vi.fn();
    mockWriter.destroy = vi.fn();

    createWriteStreamSpy.mockImplementationOnce((filePath: fs.PathLike) => {
      tempFilePath = String(filePath);
      fs.writeFileSync(tempFilePath, Buffer.alloc(0));
      return mockWriter as unknown as fs.WriteStream;
    });

    const manager = new WhisperModelManager();
    const modelName = 'ggml-tiny.en.bin';
    let resolved = false;

    const downloadPromise = manager.downloadModel(modelName).then(() => {
      resolved = true;
    });

    // Wait for first chunk to be written and paused on backpressure
    await vi.waitFor(() => {
      expect(mockWriter.write).toHaveBeenCalledTimes(1);
    });

    // Second chunk must not be written before 'drain' is emitted
    expect(mockWriter.write).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);

    // Emit 'drain' to unblock second chunk
    mockWriter.emit('drain');

    await vi.waitFor(() => {
      expect(mockWriter.write).toHaveBeenCalledTimes(2);
      expect(mockWriter.end).toHaveBeenCalledTimes(1);
    });

    // Should still not resolve or mark installed before 'close' is emitted
    expect(resolved).toBe(false);
    expect(manager.isModelInstalled(modelName)).toBe(false);

    // Emit 'finish' and 'close' to complete stream flush
    mockWriter.emit('finish');
    mockWriter.emit('close');
    await downloadPromise;

    expect(resolved).toBe(true);
    expect(manager.isModelInstalled(modelName)).toBe(true);
  });

  it('rejects and removes temporary file when write stream emits an error', async () => {
    const chunk1 = new Uint8Array([1, 2, 3, 4]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse({
        contentLength: 4,
        chunks: [chunk1],
      }),
    );

    const mockWriter = new EventEmitter() as EventEmitter & {
      write: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    let tempFilePath = '';

    mockWriter.write = vi.fn((chunk: Uint8Array) => {
      fs.appendFileSync(tempFilePath, Buffer.from(chunk));
      return true;
    });
    mockWriter.end = vi.fn(() => {
      queueMicrotask(() => {
        mockWriter.emit('error', new Error('ENOSPC: no space left on device'));
        mockWriter.emit('close');
      });
    });
    mockWriter.destroy = vi.fn();

    createWriteStreamSpy.mockImplementationOnce((filePath: fs.PathLike) => {
      tempFilePath = String(filePath);
      fs.writeFileSync(tempFilePath, Buffer.alloc(0));
      return mockWriter as unknown as fs.WriteStream;
    });

    const manager = new WhisperModelManager();
    const modelName = 'ggml-tiny.en.bin';
    const modelPath = manager.getModelPath(modelName);

    await expect(manager.downloadModel(modelName)).rejects.toThrow(
      'ENOSPC: no space left on device',
    );

    expect(manager.isModelInstalled(modelName)).toBe(false);
    expect(fs.existsSync(modelPath)).toBe(false);
    expect(fs.existsSync(`${modelPath}.downloading`)).toBe(false);
  });

  it('rejects and removes temporary file when write stream emits an error while waiting for drain', async () => {
    const chunk1 = new Uint8Array([1, 2, 3, 4]);
    const chunk2 = new Uint8Array([5, 6, 7, 8]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse({
        contentLength: 8,
        chunks: [chunk1, chunk2],
      }),
    );

    const mockWriter = new EventEmitter() as EventEmitter & {
      write: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    let tempFilePath = '';

    mockWriter.write = vi.fn((chunk: Uint8Array) => {
      fs.appendFileSync(tempFilePath, Buffer.from(chunk));
      queueMicrotask(() => {
        mockWriter.emit('error', new Error('EIO: i/o error during drain'));
        mockWriter.emit('close');
      });
      return false;
    });
    mockWriter.end = vi.fn();
    mockWriter.destroy = vi.fn();

    createWriteStreamSpy.mockImplementationOnce((filePath: fs.PathLike) => {
      tempFilePath = String(filePath);
      fs.writeFileSync(tempFilePath, Buffer.alloc(0));
      return mockWriter as unknown as fs.WriteStream;
    });

    const manager = new WhisperModelManager();
    const modelName = 'ggml-tiny.en.bin';
    const modelPath = manager.getModelPath(modelName);

    await expect(manager.downloadModel(modelName)).rejects.toThrow(
      'EIO: i/o error during drain',
    );

    expect(manager.isModelInstalled(modelName)).toBe(false);
    expect(fs.existsSync(modelPath)).toBe(false);
    expect(fs.existsSync(`${modelPath}.downloading`)).toBe(false);
  });

  it('rejects and removes temporary file when response body is empty (0 bytes)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse({
        contentLength: null,
        chunks: [],
      }),
    );

    const manager = new WhisperModelManager();
    const modelName = 'ggml-tiny.en.bin';
    const modelPath = manager.getModelPath(modelName);

    await expect(manager.downloadModel(modelName)).rejects.toThrow(
      /Incomplete download/,
    );

    expect(manager.isModelInstalled(modelName)).toBe(false);
    expect(fs.existsSync(modelPath)).toBe(false);
    expect(fs.existsSync(`${modelPath}.downloading`)).toBe(false);
  });

  it('removes a stale .downloading file before starting a new download', async () => {
    const manager = new WhisperModelManager();
    const modelName = 'ggml-tiny.en.bin';
    const modelPath = manager.getModelPath(modelName);
    fs.mkdirSync(path.dirname(modelPath), { recursive: true });
    fs.writeFileSync(`${modelPath}.downloading`, Buffer.from([9, 9, 9]));

    expect(manager.isModelInstalled(modelName)).toBe(false);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse({
        contentLength: 4,
        chunks: [new Uint8Array([1, 2, 3, 4])],
      }),
    );

    await manager.downloadModel(modelName);

    expect(manager.isModelInstalled(modelName)).toBe(true);
    expect(fs.readFileSync(modelPath)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(fs.existsSync(`${modelPath}.downloading`)).toBe(false);
  });

  it('treats a 0-byte model file as not installed', () => {
    const manager = new WhisperModelManager();
    const modelName = 'ggml-tiny.en.bin';
    const modelPath = manager.getModelPath(modelName);
    fs.mkdirSync(path.dirname(modelPath), { recursive: true });
    fs.writeFileSync(modelPath, Buffer.alloc(0));

    expect(manager.isModelInstalled(modelName)).toBe(false);
  });

  it('rejects when HTTP response is not ok or body is missing', async () => {
    const manager = new WhisperModelManager();
    const modelName = 'ggml-tiny.en.bin';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        statusText: 'Not Found',
      }),
    );
    await expect(manager.downloadModel(modelName)).rejects.toThrow(
      'Failed to download model: Not Found',
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        chunks: undefined,
      }),
    );
    await expect(manager.downloadModel(modelName)).rejects.toThrow(
      'Response body is not readable',
    );
    expect(manager.isModelInstalled(modelName)).toBe(false);
  });
});
