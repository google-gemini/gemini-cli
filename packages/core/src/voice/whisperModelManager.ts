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

/**
 * Manages Whisper models (checking existence, downloading).
 */
export class WhisperModelManager extends EventEmitter {
  private readonly modelsDir: string;

  constructor() {
    super();
    this.modelsDir = path.join(homedir(), GEMINI_DIR, 'whisper_models');
  }

  isModelInstalled(modelName: string): boolean {
    return fs.existsSync(path.join(this.modelsDir, modelName));
  }

  getModelPath(modelName: string): string {
    return path.join(this.modelsDir, modelName);
  }

  async downloadModel(modelName: string): Promise<void> {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }

    const destination = path.join(this.modelsDir, modelName);
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

    const writer = fs.createWriteStream(destination);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        transferred += value.length;
        writer.write(value);

        const percentage = total > 0 ? transferred / total : 0;
        this.emit('progress', {
          modelName,
          transferred,
          total,
          percentage,
        } as WhisperModelProgress);
      }
    } finally {
      writer.end();
    }
  }
}
