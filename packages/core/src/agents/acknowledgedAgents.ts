/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import { debugLogger } from '../utils/debugLogger.js';
import { getErrorMessage } from '../utils/errors.js';

export interface AcknowledgedAgentsMap {
  // Project Path -> Agent Name -> Agent Hash
  [projectPath: string]: {
    [agentName: string]: string;
  };
}

export class AcknowledgedAgentsService {
  private acknowledgedAgents: AcknowledgedAgentsMap = {};
  private loaded = false;

  load(): void {
    if (this.loaded) return;

    const filePath = Storage.getAcknowledgedAgentsPath();
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        this.acknowledgedAgents = JSON.parse(content);
      }
    } catch (error: unknown) {
      debugLogger.error(
        'Failed to load acknowledged agents:',
        getErrorMessage(error),
      );
      // Fallback to empty
      this.acknowledgedAgents = {};
    }
    this.loaded = true;
  }

  save(): void {
    const filePath = Storage.getAcknowledgedAgentsPath();
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        filePath,
        JSON.stringify(this.acknowledgedAgents, null, 2),
        'utf-8',
      );
    } catch (error) {
      debugLogger.error('Failed to save acknowledged agents:', error);
    }
  }

  isAcknowledged(
    projectPath: string,
    agentName: string,
    hash: string,
  ): boolean {
    this.load();
    const projectAgents = this.acknowledgedAgents[projectPath];
    if (!projectAgents) return false;
    return projectAgents[agentName] === hash;
  }

  acknowledge(projectPath: string, agentName: string, hash: string): void {
    this.load();
    if (!this.acknowledgedAgents[projectPath]) {
      this.acknowledgedAgents[projectPath] = {};
    }
    this.acknowledgedAgents[projectPath][agentName] = hash;
    this.save();
  }
}
