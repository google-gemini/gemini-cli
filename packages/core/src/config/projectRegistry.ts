/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLogger } from '../utils/debugLogger.js';

export interface RegistryData {
  projects: Record<string, string>;
}

/**
 * Manages a mapping between absolute project paths and short, human-readable identifiers.
 * This helps reduce context bloat and makes temporary directories easier to work with.
 */
export class ProjectRegistry {
  private readonly registryPath: string;
  private data: RegistryData | undefined;

  constructor(registryPath: string) {
    this.registryPath = registryPath;
  }

  /**
   * Initializes the registry by loading data from disk.
   */
  initialize(): void {
    if (this.data) {
      return;
    }

    if (!fs.existsSync(this.registryPath)) {
      this.data = { projects: {} };
      return;
    }

    try {
      const content = fs.readFileSync(this.registryPath, 'utf8');
      this.data = JSON.parse(content);
    } catch (e) {
      debugLogger.debug('Failed to load registry: ', e);
      // If the registry is corrupted, we'll start fresh to avoid blocking the CLI
      this.data = { projects: {} };
    }
  }

  private normalizePath(projectPath: string): string {
    let resolved = path.resolve(projectPath);
    if (os.platform() === 'win32') {
      resolved = resolved.toLowerCase();
    }
    return resolved;
  }

  private save(): void {
    if (!this.data) {
      return;
    }

    const dir = path.dirname(this.registryPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      const content = JSON.stringify(this.data, null, 2);
      const tmpPath = `${this.registryPath}.tmp`;
      fs.writeFileSync(tmpPath, content, 'utf8');
      fs.renameSync(tmpPath, this.registryPath);
    } catch (error) {
      debugLogger.debug(
        `Failed to save project registry to ${this.registryPath}:`,
        error,
      );
    }
  }

  /**
   * Returns a short identifier for the given project path.
   * If the project is not already in the registry, a new identifier is generated and saved.
   */
  getShortId(projectPath: string): string {
    if (!this.data) {
      throw new Error('ProjectRegistry must be initialized before use');
    }

    const normalizedPath = this.normalizePath(projectPath);

    if (this.data.projects[normalizedPath]) {
      return this.data.projects[normalizedPath];
    }

    const shortId = this.generateUniqueShortId(
      normalizedPath,
      this.data.projects,
    );
    this.data.projects[normalizedPath] = shortId;
    this.save();
    return shortId;
  }

  private generateUniqueShortId(
    projectPath: string,
    existing: Record<string, string>,
  ): string {
    const baseName = path.basename(projectPath) || 'project';
    const slug = this.slugify(baseName);

    let candidate = slug;
    let counter = 1;

    const existingIds = new Set(Object.values(existing));

    while (existingIds.has(candidate)) {
      candidate = `${slug}-${counter}`;
      counter++;
    }

    return candidate;
  }

  private slugify(text: string): string {
    return (
      text
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'project'
    );
  }
}
