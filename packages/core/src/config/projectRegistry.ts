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

const PROJECT_ROOT_FILE = '.project_root';
const LOCK_TIMEOUT_MS = 10000;
const LOCK_RETRY_DELAY_MS = 100;

/**
 * Manages a mapping between absolute project paths and short, human-readable identifiers.
 * This helps reduce context bloat and makes temporary directories easier to work with.
 */
export class ProjectRegistry {
  private readonly registryPath: string;
  private readonly baseDirs: string[];
  private data: RegistryData | undefined;

  constructor(registryPath: string, baseDirs: string[] = []) {
    this.registryPath = registryPath;
    this.baseDirs = baseDirs;
  }

  /**
   * Initializes the registry by loading data from disk.
   */
  initialize(): void {
    if (this.data) {
      return;
    }

    this.data = this.loadData();
  }

  private loadData(): RegistryData {
    if (!fs.existsSync(this.registryPath)) {
      return { projects: {} };
    }

    try {
      const content = fs.readFileSync(this.registryPath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      debugLogger.debug('Failed to load registry: ', e);
      // If the registry is corrupted, we'll start fresh to avoid blocking the CLI
      return { projects: {} };
    }
  }

  private normalizePath(projectPath: string): string {
    let resolved = path.resolve(projectPath);
    if (os.platform() === 'win32') {
      resolved = resolved.toLowerCase();
    }
    return resolved;
  }

  private save(data: RegistryData): void {
    const dir = path.dirname(this.registryPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      const content = JSON.stringify(data, null, 2);
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

  private acquireLock(): number {
    const lockPath = `${this.registryPath}.lock`;
    const dir = path.dirname(lockPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const start = Date.now();
    while (Date.now() - start < LOCK_TIMEOUT_MS) {
      try {
        return fs.openSync(lockPath, 'wx');
      } catch (e: unknown) {
        if ((e as { code: string })['code'] !== 'EEXIST') {
          throw e;
        }
        // Busy wait a bit - in a CLI tool it is fine.
        const waitTill = Date.now() + LOCK_RETRY_DELAY_MS;
        while (Date.now() < waitTill) {
          /* busy wait */
        }
      }
    }
    throw new Error(
      `Timeout acquiring lock on project registry: ${this.registryPath}`,
    );
  }

  private releaseLock(fd: number): void {
    try {
      fs.closeSync(fd);
    } catch (e) {
      debugLogger.debug('Failed to close lock file descriptor:', e);
    }
    try {
      fs.unlinkSync(`${this.registryPath}.lock`);
    } catch (e) {
      debugLogger.debug('Failed to unlink lock file:', e);
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

    // Use a lock to prevent racy updates
    const lockFd = this.acquireLock();
    try {
      // Re-load data under lock to get the latest state
      const currentData = this.loadData();
      this.data = currentData;

      let shortId: string | undefined = currentData.projects[normalizedPath];

      // If we have a mapping, verify it against the folders on disk
      if (shortId) {
        if (this.verifySlugOwnership(shortId, normalizedPath)) {
          // HEAL: If it passed verification but markers are missing (e.g. new base dir or deleted marker), recreate them.
          this.ensureOwnershipMarkers(shortId, normalizedPath);
          return shortId;
        }
        // If verification fails, it means the registry is out of sync or someone else took it.
        // We'll remove the mapping and find/generate a new one.
        delete currentData.projects[normalizedPath];
      }

      // Try to find if this project already has folders assigned that we didn't know about
      shortId = this.findExistingSlugForPath(normalizedPath);

      if (!shortId) {
        // Generate a new one
        shortId = this.claimNewSlug(normalizedPath, currentData.projects);
      }

      currentData.projects[normalizedPath] = shortId;
      this.save(currentData);
      return shortId;
    } finally {
      this.releaseLock(lockFd);
    }
  }

  private verifySlugOwnership(slug: string, projectPath: string): boolean {
    if (this.baseDirs.length === 0) {
      return true; // Nothing to verify against
    }

    for (const baseDir of this.baseDirs) {
      const markerPath = path.join(baseDir, slug, PROJECT_ROOT_FILE);
      if (fs.existsSync(markerPath)) {
        try {
          const owner = fs.readFileSync(markerPath, 'utf8').trim();
          if (this.normalizePath(owner) !== this.normalizePath(projectPath)) {
            return false;
          }
        } catch (e) {
          debugLogger.debug(
            `Failed to read ownership marker ${markerPath}:`,
            e,
          );
          // If we can't read it, assume it's not ours or corrupted.
          return false;
        }
      }
    }
    return true;
  }

  private findExistingSlugForPath(projectPath: string): string | undefined {
    if (this.baseDirs.length === 0) {
      return undefined;
    }

    const normalizedTarget = this.normalizePath(projectPath);

    // Scan base dirs to see if any slug already belongs to this project
    // We only need to check the first base dir as they should be in sync
    const baseDir = this.baseDirs[0];
    if (!fs.existsSync(baseDir)) {
      return undefined;
    }

    try {
      const candidates = fs.readdirSync(baseDir);
      for (const candidate of candidates) {
        const markerPath = path.join(baseDir, candidate, PROJECT_ROOT_FILE);
        if (fs.existsSync(markerPath)) {
          const owner = fs.readFileSync(markerPath, 'utf8').trim();
          if (this.normalizePath(owner) === normalizedTarget) {
            // Found it! Ensure all base dirs have the marker
            this.ensureOwnershipMarkers(candidate, normalizedTarget);
            return candidate;
          }
        }
      }
    } catch (e) {
      debugLogger.debug(`Failed to scan base dir ${baseDir}:`, e);
    }

    return undefined;
  }

  private claimNewSlug(
    projectPath: string,
    existingMappings: Record<string, string>,
  ): string {
    const baseName = path.basename(projectPath) || 'project';
    const slug = this.slugify(baseName);

    let counter = 0;
    const existingIds = new Set(Object.values(existingMappings));

    while (true) {
      const candidate = counter === 0 ? slug : `${slug}-${counter}`;
      counter++;

      // Check if taken in registry
      if (existingIds.has(candidate)) {
        continue;
      }

      // Check if taken on disk
      let diskCollision = false;
      for (const baseDir of this.baseDirs) {
        const markerPath = path.join(baseDir, candidate, PROJECT_ROOT_FILE);
        if (fs.existsSync(markerPath)) {
          try {
            const owner = fs.readFileSync(markerPath, 'utf8').trim();
            if (this.normalizePath(owner) !== this.normalizePath(projectPath)) {
              diskCollision = true;
              break;
            }
          } catch (_e) {
            // If we can't read it, assume it's someone else's to be safe
            diskCollision = true;
            break;
          }
        }
      }

      if (diskCollision) {
        continue;
      }

      // Try to claim it
      try {
        this.ensureOwnershipMarkers(candidate, projectPath);
        return candidate;
      } catch (_e) {
        // Someone might have claimed it between our check and our write.
        // Try next candidate.
        continue;
      }
    }
  }

  private ensureOwnershipMarkers(slug: string, projectPath: string): void {
    const normalizedProject = this.normalizePath(projectPath);
    for (const baseDir of this.baseDirs) {
      const slugDir = path.join(baseDir, slug);
      if (!fs.existsSync(slugDir)) {
        fs.mkdirSync(slugDir, { recursive: true });
      }
      const markerPath = path.join(slugDir, PROJECT_ROOT_FILE);
      if (fs.existsSync(markerPath)) {
        const owner = fs.readFileSync(markerPath, 'utf8').trim();
        if (this.normalizePath(owner) === normalizedProject) {
          continue;
        }
        // Collision!
        throw new Error(`Slug ${slug} is already owned by ${owner}`);
      }
      // Use flag: 'wx' to ensure atomic creation
      fs.writeFileSync(markerPath, normalizedProject, {
        encoding: 'utf8',
        flag: 'wx',
      });
    }
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
