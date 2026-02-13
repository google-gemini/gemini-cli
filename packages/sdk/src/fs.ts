/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config as CoreConfig } from '@google/gemini-cli-core';
import type { AgentFilesystem } from './types.js';
import fs from 'node:fs/promises';

export class SdkAgentFilesystem implements AgentFilesystem {
  constructor(private readonly config: CoreConfig) {}

  async readFile(path: string): Promise<string | null> {
    const error = this.config.validatePathAccess(path, 'read');
    if (error) {
      // For now, if access is denied, we can either throw or return null.
      // Returning null makes sense for "file not found or readable".
      return null;
    }
    try {
      return await fs.readFile(path, 'utf-8');
    } catch {
      return null;
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const error = this.config.validatePathAccess(path, 'write');
    if (error) {
      throw new Error(error);
    }
    await fs.writeFile(path, content, 'utf-8');
  }
}
