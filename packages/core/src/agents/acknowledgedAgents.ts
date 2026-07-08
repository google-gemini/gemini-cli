/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import { debugLogger } from '../utils/debugLogger.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';

export interface AcknowledgedAgentsMap {
  // Project Path -> Agent Name -> Agent Hash
  [projectPath: string]: {
    [agentName: string]: string;
  };
}

export class AcknowledgedAgentsService {
  private acknowledgedAgents: AcknowledgedAgentsMap = {};
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;

    const filePath = Storage.getAcknowledgedAgentsPath();
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      this.acknowledgedAgents = JSON.parse(content);
    } catch (error: unknown) {
      if (!isNodeError(error) || error.code !== 'ENOENT') {
        debugLogger.error(
          'Failed to load acknowledged agents:',
          getErrorMessage(error),
        );
      }
      // If file doesn't exist or there's a parsing error, fallback to empty
      this.acknowledgedAgents = {};
    }
    this.loaded = true;
  }

  async save(): Promise<void> {
    const filePath = Storage.getAcknowledgedAgentsPath();
    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify(this.acknowledgedAgents, null, 2),
        'utf-8',
      );
    } catch (error) {
      debugLogger.error(
        'Failed to save acknowledged agents:',
        getErrorMessage(error),
      );
    }
  }

  async isAcknowledged(
    projectPath: string,
    agentName: string,
    hash: string,
  ): Promise<boolean> {
    await this.load();
    const projectAgents = this.acknowledgedAgents[projectPath];
    if (!projectAgents) return false;
    return projectAgents[agentName] === hash;
  }

  async acknowledge(
    projectPath: string,
    agentName: string,
    hash: string,
  ): Promise<void> {
    await this.load();
    if (!this.acknowledgedAgents[projectPath]) {
      this.acknowledgedAgents[projectPath] = {};
    }
    this.acknowledgedAgents[projectPath][agentName] = hash;
    await this.save();
  }
}
