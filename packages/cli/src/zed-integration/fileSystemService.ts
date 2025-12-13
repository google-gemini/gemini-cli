/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FileSystemService } from '@google/gemini-cli-core';
import type * as acp from './acp.js';
import { RequestError } from './connection.js';
import type { ErrorResponse } from './schema.js';

/**
 * ACP client-based implementation of FileSystemService
 */
export class AcpFileSystemService implements FileSystemService {
  constructor(
    private readonly client: acp.Client,
    private readonly sessionId: string,
    readonly capabilities: acp.FileSystemCapability,
    private readonly fallback: FileSystemService,
  ) {}

  async readTextFile(filePath: string): Promise<string> {
    if (!this.capabilities.readTextFile) {
      return this.fallback.readTextFile(filePath);
    }

    try {
      const response = await this.client.readTextFile({
        path: filePath,
        sessionId: this.sessionId,
        line: null,
        limit: null,
      });

      return response.content;
    } catch (err) {
      // Convert ACP error to Node.js ENOENT for file not found
      const errorResponse = err as ErrorResponse;
      if (errorResponse.code === RequestError.RESOURCE_NOT_FOUND) {
        const nodeErr = new Error(
          `ENOENT: open '${filePath}'`,
        ) as NodeJS.ErrnoException;
        nodeErr.code = 'ENOENT';
        nodeErr.syscall = 'open';
        nodeErr.path = filePath;
        throw nodeErr;
      }
      throw err;
    }
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    if (!this.capabilities.writeTextFile) {
      return this.fallback.writeTextFile(filePath, content);
    }

    await this.client.writeTextFile({
      path: filePath,
      content,
      sessionId: this.sessionId,
    });
  }
}
