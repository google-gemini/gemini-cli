/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Config } from '../config/config.js';
import { GitService } from './gitService.js';
import { ToolCallRequestInfo } from '../core/turn.js';
import { Content } from '@google/genai';

export interface ToolCallCheckpoint {
  timestamp: string;
  toolCall: ToolCallRequestInfo;
  history: Content[];
  clientHistory?: Content[];
  commitHash?: string;
}

export class CheckpointingService {
  private config: Config;
  private gitService: GitService | null = null;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Creates a checkpoint before executing a tool call
   */
  async createCheckpoint(
    toolCall: ToolCallRequestInfo,
    history: Content[],
    clientHistory?: Content[],
  ): Promise<string | null> {
    if (!this.config.getCheckpointingEnabled()) {
      return null;
    }

    try {
      // Initialize git service if not already done
      if (!this.gitService) {
        this.gitService = new GitService(this.config.getTargetDir());
        await this.gitService.setupShadowGitRepository();
      }

      // Create git snapshot
      const commitMessage = `Checkpoint before ${toolCall.name} tool call`;
      const commitHash =
        await this.gitService.createFileSnapshot(commitMessage);

      // Create checkpoint data
      const checkpoint: ToolCallCheckpoint = {
        timestamp: new Date().toISOString(),
        toolCall,
        history,
        clientHistory,
        commitHash,
      };

      // Save checkpoint to file
      const checkpointDir = path.join(
        this.config.getProjectTempDir(),
        'checkpoints',
      );
      await fs.mkdir(checkpointDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath =
        (toolCall.args as { file_path?: string } | undefined)?.file_path ||
        'unknown';
      const fileName = `${timestamp}_${path.basename(filePath)}_${toolCall.name}.json`;
      const checkpointPath = path.join(checkpointDir, fileName);

      await fs.writeFile(
        checkpointPath,
        JSON.stringify(checkpoint, null, 2),
        'utf-8',
      );

      return fileName;
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      return null;
    }
  }

  /**
   * Determines if a tool call should trigger checkpointing
   */
  shouldCheckpoint(toolCall: ToolCallRequestInfo): boolean {
    if (!this.config.getCheckpointingEnabled()) {
      return false;
    }

    // Checkpoint file-modifying tools
    const fileModifyingTools = ['write_file', 'edit', 'replace'];
    return fileModifyingTools.includes(toolCall.name);
  }
}
