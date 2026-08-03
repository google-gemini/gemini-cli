/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { homedir, GEMINI_DIR } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface WhisperModelProgress {
  modelName: string;
  transferred: number;
  total: number;
  percentage: number;
}

export interface WhisperModelManagerEvents {
  progress: [WhisperModelProgress];
}

const ALLOWED_MODELS = [
  'ggml-tiny.en.bin',
  'ggml-base.en.bin',
  'ggml-large-v3-turbo-q5_0.bin',
  'ggml-large-v3-turbo-q8_0.bin',
];

async function* readResponseBody(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  let completed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        return;
      }
      yield value;
    }
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}

/**
 * Manages Whisper models (checking existence, downloading).
 */
export class WhisperModelManager extends EventEmitter<WhisperModelManagerEvents> {
  private readonly modelsDir: string;

  constructor() {
    super();
    this.modelsDir = path.join(homedir(), GEMINI_DIR, 'whisper_models');
  }

  isModelInstalled(modelName: string): boolean {
    this.validateModelName(modelName);
    return fs.existsSync(path.join(this.modelsDir, modelName));
  }

  getModelPath(modelName: string): string {
    this.validateModelName(modelName);
    return path.join(this.modelsDir, modelName);
  }

  async downloadModel(modelName: string): Promise<void> {
    this.validateModelName(modelName);

    await fs.promises.mkdir(this.modelsDir, { recursive: true });

    const destination = path.join(this.modelsDir, modelName);
    const temporaryDestination = `${destination}.${randomUUID()}.downloading`;
    const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelName}`;

    debugLogger.debug(
      `[WhisperModelManager] Downloading ${modelName} from ${url}`,
    );

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download model: ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const expectedSize = contentLength ? Number(contentLength) : undefined;
    const total =
      expectedSize !== undefined && Number.isSafeInteger(expectedSize)
        ? expectedSize
        : 0;
    let transferred = 0;

    if (!response.body) {
      throw new Error('Response body is not readable');
    }

    const progressTracker = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        transferred += chunk.length;

        const percentage = total > 0 ? transferred / total : 0;
        this.emit('progress', {
          modelName,
          transferred,
          total,
          percentage,
        });

        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        Readable.from(readResponseBody(response.body), { objectMode: false }),
        progressTracker,
        fs.createWriteStream(temporaryDestination, { flags: 'wx' }),
      );

      if (transferred === 0) {
        throw new Error('Downloaded model is empty');
      }

      if (total > 0 && transferred !== total) {
        throw new Error(
          `Incomplete model download: expected ${total} bytes, received ${transferred}`,
        );
      }

      const temporaryFile = await fs.promises.open(temporaryDestination, 'r+');
      try {
        await temporaryFile.sync();
      } finally {
        await temporaryFile.close();
      }

      await fs.promises.rename(temporaryDestination, destination);
    } catch (error) {
      try {
        await fs.promises.rm(temporaryDestination, { force: true });
      } catch (cleanupError) {
        debugLogger.warn(
          `[WhisperModelManager] Failed to remove incomplete download ${temporaryDestination}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
      throw error;
    }
  }

  private validateModelName(modelName: string): void {
    if (!ALLOWED_MODELS.includes(modelName)) {
      throw new Error(`Unauthorized model name: ${modelName}`);
    }
  }
}
