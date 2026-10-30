/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';
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
    const modelPath = path.join(this.modelsDir, modelName);
    if (!fs.existsSync(modelPath)) {
      return false;
    }
    try {
      return fs.statSync(modelPath).size > 0;
    } catch {
      return false;
    }
  }

  getModelPath(modelName: string): string {
    this.validateModelName(modelName);
    return path.join(this.modelsDir, modelName);
  }

  async downloadModel(modelName: string): Promise<void> {
    this.validateModelName(modelName);

    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }

    const destination = path.join(this.modelsDir, modelName);
    const tempDestination = `${destination}.downloading`;
    const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelName}`;

    debugLogger.debug(
      `[WhisperModelManager] Downloading ${modelName} from ${url}`,
    );

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download model: ${response.statusText}`);
    }

    const total = parseInt(response.headers.get('content-length') || '0', 10);
    let transferred = 0;

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    if (fs.existsSync(tempDestination)) {
      await fs.promises.unlink(tempDestination);
    }

    const writer = fs.createWriteStream(tempDestination);
    let streamError: Error | null = null;
    const closePromise = new Promise<void>((resolve, reject) => {
      writer.once('close', () => {
        if (streamError) {
          reject(streamError);
        } else {
          resolve();
        }
      });
      writer.once('error', (err) => {
        streamError = err;
        void reader.cancel?.().catch(() => {});
      });
    });
    closePromise.catch(() => {});

    try {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (streamError) {
            throw streamError;
          }

          transferred += value.length;
          const writeOk = writer.write(value);
          if (streamError) {
            throw streamError;
          }
          if (!writeOk) {
            await new Promise<void>((resolve, reject) => {
              const onDrain = () => {
                writer.off('error', onError);
                resolve();
              };
              const onError = (err: Error) => {
                writer.off('drain', onDrain);
                reject(err);
              };
              writer.once('drain', onDrain);
              writer.once('error', onError);
            });
          }

          const percentage = total > 0 ? transferred / total : 0;
          this.emit('progress', {
            modelName,
            transferred,
            total,
            percentage,
          });
        }
      } finally {
        writer.end();
      }

      await closePromise;

      if (transferred === 0 || (total > 0 && transferred !== total)) {
        throw new Error(
          `Incomplete download for ${modelName}: expected ${total} bytes, received ${transferred} bytes`,
        );
      }

      await fs.promises.rename(tempDestination, destination);
    } catch (error) {
      await closePromise.catch(() => {});
      if (fs.existsSync(tempDestination)) {
        try {
          await fs.promises.unlink(tempDestination);
        } catch {
          // Ignore cleanup errors
        }
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
