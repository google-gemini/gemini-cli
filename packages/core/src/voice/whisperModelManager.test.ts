/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WhisperModelManager } from './whisperModelManager.js';

describe('WhisperModelManager', () => {
  let tmpDir: string;
  let manager: WhisperModelManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-test-'));
    vi.stubEnv('HOME', tmpDir);
    vi.stubEnv('USERPROFILE', tmpDir);
    manager = new WhisperModelManager();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should throw for unauthorized model names', () => {
    expect(() => manager.isModelInstalled('unauthorized.bin')).toThrow(
      'Unauthorized model name: unauthorized.bin',
    );
    expect(() => manager.getModelPath('malicious/path.bin')).toThrow(
      'Unauthorized model name: malicious/path.bin',
    );
  });

  it('should correctly report if a model is installed', () => {
    const modelName = 'ggml-tiny.en.bin';
    expect(manager.isModelInstalled(modelName)).toBe(false);

    const modelPath = manager.getModelPath(modelName);
    fs.mkdirSync(path.dirname(modelPath), { recursive: true });
    fs.writeFileSync(modelPath, 'fake-model-content');

    expect(manager.isModelInstalled(modelName)).toBe(true);
  });

  it('should download a model successfully and atomically rename', async () => {
    const modelName = 'ggml-tiny.en.bin';
    const fakeContent = new Uint8Array([1, 2, 3, 4, 5]);

    const mockResponse = {
      ok: true,
      headers: new Headers({ 'content-length': '5' }),
      body: {
        getReader: () => {
          let read = false;
          return {
            read: async () => {
              if (!read) {
                read = true;
                return { done: false, value: fakeContent };
              }
              return { done: true, value: undefined };
            },
          };
        },
      },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const progressEvents: unknown[] = [];
    manager.on('progress', (p) => progressEvents.push(p));

    await manager.downloadModel(modelName);

    expect(manager.isModelInstalled(modelName)).toBe(true);
    const destPath = manager.getModelPath(modelName);
    const downloadedData = fs.readFileSync(destPath);
    expect(downloadedData).toEqual(Buffer.from(fakeContent));

    // .downloading file should not remain
    expect(fs.existsSync(`${destPath}.downloading`)).toBe(false);
    expect(progressEvents.length).toBeGreaterThan(0);
  });

  it('should clean up .downloading file if download is interrupted or fails', async () => {
    const modelName = 'ggml-tiny.en.bin';
    const fakeContent = new Uint8Array([1, 2]);

    const mockResponse = {
      ok: true,
      headers: new Headers({ 'content-length': '100' }), // Declared 100 bytes, but only sending 2
      body: {
        getReader: () => {
          let read = false;
          return {
            read: async () => {
              if (!read) {
                read = true;
                return { done: false, value: fakeContent };
              }
              return { done: true, value: undefined };
            },
          };
        },
      },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    await expect(manager.downloadModel(modelName)).rejects.toThrow(
      'Incomplete download for ggml-tiny.en.bin: received 2 of 100 bytes',
    );

    const destPath = manager.getModelPath(modelName);
    expect(fs.existsSync(destPath)).toBe(false);
    expect(fs.existsSync(`${destPath}.downloading`)).toBe(false);
    expect(manager.isModelInstalled(modelName)).toBe(false);
  });

  it('should clean up .downloading file on stream error', async () => {
    const modelName = 'ggml-tiny.en.bin';

    const mockResponse = {
      ok: true,
      headers: new Headers({ 'content-length': '50' }),
      body: {
        getReader: () => ({
          read: async () => {
            throw new Error('Network dropped');
          },
        }),
      },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    await expect(manager.downloadModel(modelName)).rejects.toThrow(
      'Network dropped',
    );

    const destPath = manager.getModelPath(modelName);
    expect(fs.existsSync(destPath)).toBe(false);
    expect(fs.existsSync(`${destPath}.downloading`)).toBe(false);
    expect(manager.isModelInstalled(modelName)).toBe(false);
  });
});
