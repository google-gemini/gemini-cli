/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FileSystemService } from '@google/gemini-cli-core';
import type * as acp from '@agentclientprotocol/sdk';

/**
 * ACP client-based implementation of FileSystemService
 */
export class AcpFileSystemService implements FileSystemService {
  constructor(
    private readonly connection: acp.AgentSideConnection,
    private readonly sessionId: string,
    private readonly capabilities: acp.FileSystemCapability,
    private readonly fallback: FileSystemService,
  ) {}

  async readTextFile(filePath: string): Promise<string> {
    if (!this.capabilities.readTextFile) {
      return this.fallback.readTextFile(filePath);
    }

    const response = await this.connection.readTextFile({
      path: filePath,
      sessionId: this.sessionId,
    });

    return response.content;
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
}
