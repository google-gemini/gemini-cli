/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

export class Config {
  private apiKey: string;
  private model: string;
  private targetDir: string;

  constructor(apiKey: string, model: string, targetDir: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.targetDir = targetDir;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  getModel(): string {
    return this.model;
  }

  getTargetDir(): string {
    return this.targetDir;
  }
}

function findEnvFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

export function loadEnvironment(): void {
  const envFilePath = findEnvFile(process.cwd());
  if (!envFilePath) {
    return;
  }
  dotenv.config({ path: envFilePath });
}

export function createServerConfig(
  apiKey: string,
  model: string,
  targetDir: string,
): Config {
  return new Config(apiKey, model, path.resolve(targetDir));
}
