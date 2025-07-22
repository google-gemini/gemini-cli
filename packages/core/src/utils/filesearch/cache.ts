/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

const cacheDir = path.join(os.homedir(), '.gemini-cli-cache');
fs.mkdirSync(cacheDir, { recursive: true });

export const getCacheKey = (
  directory: string,
  ignoreContent: string,
): string => {
  const hash = crypto.createHash('sha256');
  hash.update(directory);
  hash.update(ignoreContent);
  return hash.digest('hex');
};

export const getCacheFile = (key: string): string => path.join(cacheDir, key);

export const readCache = (file: string): { results: string[] } | undefined => {
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as { results: string[] };
    } catch {
      return undefined; // Invalid JSON
    }
  }

  return undefined;
};

export const writeCache = (file: string, data: { results: string[] }): void => {
  fs.writeFileSync(file, JSON.stringify(data));
};

export const isCacheStale = (file: string, ttl: number): boolean => {
  try {
    const stats = fs.statSync(file);
    const now = Date.now();
    const fileTime = new Date(stats.mtime).getTime();
    return now - fileTime > ttl;
  } catch {
    return true;
  }
};
