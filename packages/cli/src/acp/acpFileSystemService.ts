/**
 * @license
 * Copyright 2026 Google LLC
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
    // Resolve a useful message for both Error instances and plain objects
    // that carry a `message` field (a common shape for JSON-RPC error
    // responses). Avoids `String({}) === '[object Object]'` swallowing
    // the real message for non-Error rejections.
    const errMessage = (() => {
      if (err instanceof Error) return err.message;
      if (err && typeof err === 'object' && 'message' in err) {
        const m = (err as { message?: unknown }).message;
        if (typeof m === 'string') return m;
      }
      return String(err);
    })();

    // Structured signal first: a JSON-RPC error object's `code` field is the
    // authoritative not-found indicator when the ACP server emits it. Falls
    // back to substring matching below for servers that haven't migrated to
    // structured error codes yet.
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: unknown }).code;
      if (code === 'ENOENT') {
        const newErr = new Error(errMessage) as NodeJS.ErrnoException;
        newErr.code = 'ENOENT';
        throw newErr;
      }
    }

    if (
      errMessage.includes('Resource not found') ||
      errMessage.includes('ENOENT') ||
      errMessage.includes('does not exist') ||
      errMessage.includes('No such file') ||
      errMessage.includes('not_found') ||
      errMessage.includes('file not found')
    ) {
      const newErr = new Error(errMessage) as NodeJS.ErrnoException;
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
