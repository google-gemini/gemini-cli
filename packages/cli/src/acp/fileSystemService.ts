/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isWithinRoot, type FileSystemService } from '@google/gemini-cli-core';
import type * as acp from '@agentclientprotocol/sdk';
import os from 'node:os';
import path from 'node:path';

/**
 * ACP client-based implementation of FileSystemService
 */
export class AcpFileSystemService implements FileSystemService {
  private readonly geminiDir = path.join(os.homedir(), '.gemini');

  constructor(
    private readonly connection: acp.AgentSideConnection,
    private readonly sessionId: string,
    private readonly capabilities: acp.FileSystemCapabilities,
    private readonly fallback: FileSystemService,
    private readonly root: string,
  ) {}

  private shouldUseFallback(filePath: string): boolean {
    // Files inside the global CLI directory must always use the native file system,
    // even if the user runs the CLI directly from their home directory (which
    // would make the IDE's project root overlap with the global directory).
    return (
      !isWithinRoot(filePath, this.root) ||
      isWithinRoot(filePath, this.geminiDir)
    );
  }

  private normalizeFileSystemError(err: unknown): never {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (
      errorMessage.includes('Resource not found') ||
      errorMessage.includes('ENOENT') ||
      errorMessage.includes('does not exist') ||
      errorMessage.includes('No such file')
    ) {
      const newErr = new Error(errorMessage) as NodeJS.ErrnoException;
      newErr.code = 'ENOENT';
      throw newErr;
    }
    throw err;
  }

  async readTextFile(filePath: string): Promise<string> {
    if (!this.capabilities.readTextFile || this.shouldUseFallback(filePath)) {
      return this.fallback.readTextFile(filePath);
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const response = await this.connection.readTextFile({
        path: filePath,
        sessionId: this.sessionId,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return response.content;
    } catch (err: unknown) {
      this.normalizeFileSystemError(err);
    }
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    if (!this.capabilities.writeTextFile || this.shouldUseFallback(filePath)) {
      return this.fallback.writeTextFile(filePath, content);
    }

    try {
      await this.connection.writeTextFile({
        path: filePath,
        content,
        sessionId: this.sessionId,
      });
    } catch (err: unknown) {
      this.normalizeFileSystemError(err);
    }
  }
}
