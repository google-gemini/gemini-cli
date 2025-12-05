/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FileSystemService } from '@google/gemini-cli-core';
import * as acp from '@agentclientprotocol/sdk';

/**
 * ACP client-based implementation of FileSystemService
 */
export class AcpFileSystemService implements FileSystemService {
  constructor(
    private readonly connection: acp.AgentSideConnection,
    private readonly sessionId: string,
    readonly capabilities: acp.FileSystemCapability,
    private readonly fallback: FileSystemService,
  ) {}

  async readTextFile(filePath: string): Promise<string> {
    if (!this.capabilities.readTextFile) {
      return this.fallback.readTextFile(filePath);
    }

    try {
      const response = await this.connection.readTextFile({
        path: filePath,
        sessionId: this.sessionId,
      });

      return response.content;
    } catch (err) {
      // Convert ACP error to Node.js ENOENT for file not found
      const requestErrorCode =
        err instanceof acp.RequestError
          ? err.code
          : typeof err === 'object' && err !== null && 'code' in err
            ? (err as { code?: unknown }).code
            : undefined;
      if (requestErrorCode === -32002 || requestErrorCode === '-32002') {
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

    await this.connection.writeTextFile({
      path: filePath,
      content,
      sessionId: this.sessionId,
    });
  }

  findFiles(fileName: string, searchPaths: readonly string[]): string[] {
    return this.fallback.findFiles(fileName, searchPaths);
  }
}
