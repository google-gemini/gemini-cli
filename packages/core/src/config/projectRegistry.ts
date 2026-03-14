/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { lock } from 'proper-lockfile';
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
  private initPromise: Promise<void> | undefined;

  constructor(registryPath: string, baseDirs: string[] = []) {
    this.registryPath = registryPath;
    this.baseDirs = baseDirs;
  }

  /**
   * Initializes the registry by loading data from disk.
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      if (this.data) {
        return;
      }

      this.data = await this.loadData();
    })();

    return this.initPromise;
  }

  private async loadData(): Promise<RegistryData> {
    if (!fs.existsSync(this.registryPath)) {
      return { projects: {} };
    }

    try {
      const content = await fs.promises.readFile(this.registryPath, 'utf8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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

  private async save(data: RegistryData): Promise<void> {
    const dir = path.dirname(this.registryPath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    try {
      const content = JSON.stringify(data, null, 2);
      const tmpPath = `${this.registryPath}.tmp`;
      await fs.promises.writeFile(tmpPath, content, 'utf8');
      await fs.promises.rename(tmpPath, this.registryPath);
    } catch (error) {
      debugLogger.error(
        `Failed to save project registry to ${this.registryPath}:`,
        error,
      );
    }
  }

  /**
   * Returns a short identifier for the given project path.
   * If the project is not already in the registry, a new identifier is generated and saved.
   */
  async getShortId(projectPath: string): Promise<string> {
    if (!this.data) {
      throw new Error('ProjectRegistry must be initialized before use');
    }

    const normalizedPath = this.normalizePath(projectPath);

    // Ensure directory exists so we can create a lock file
    const dir = path.dirname(this.registryPath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    // Ensure the registry file exists so proper-lockfile can lock it
    if (!fs.existsSync(this.registryPath)) {
      await this.save({ projects: {} });
    }

    // Use proper-lockfile to prevent racy updates
    const release = await lock(this.registryPath, {
      retries: {
        retries: Math.floor(LOCK_TIMEOUT_MS / LOCK_RETRY_DELAY_MS),
        minTimeout: LOCK_RETRY_DELAY_MS,
      },
    });

    try {
      // Re-load data under lock to get the latest state
      const currentData = await this.loadData();
      this.data = currentData;

      let shortId: string | undefined = currentData.projects[normalizedPath];

      // If we have a mapping, verify it against the folders on disk
      if (shortId) {
        if (await this.verifySlugOwnership(shortId, normalizedPath)) {
          // HEAL: If it passed verification but markers are missing (e.g. new base dir or deleted marker), recreate them.
          await this.ensureOwnershipMarkers(shortId, normalizedPath);
          return shortId;
        }
        // If verification fails, it means the registry is out of sync or someone else took it.
        // We'll remove the mapping and find/generate a new one.
        delete currentData.projects[normalizedPath];
      }

      // Try to find if this project already has folders assigned that we didn't know about
      shortId = await this.findExistingSlugForPath(normalizedPath);

      if (!shortId) {
        // Generate a new one
        shortId = await this.claimNewSlug(normalizedPath, currentData.projects);
      }

      currentData.projects[normalizedPath] = shortId;
      await this.save(currentData);
      return shortId;
    } finally {
      await release();
    }
  }

  private async verifySlugOwnership(
    slug: string,
    projectPath: string,
  ): Promise<boolean> {
    if (this.baseDirs.length === 0) {
      return true; // Nothing to verify against
    }

    for (const baseDir of this.baseDirs) {
      const markerPath = path.join(baseDir, slug, PROJECT_ROOT_FILE);
      if (fs.existsSync(markerPath)) {
        try {
          const owner = (await fs.promises.readFile(markerPath, 'utf8')).trim();
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

  private async findExistingSlugForPath(
    projectPath: string,
  ): Promise<string | undefined> {
    if (this.baseDirs.length === 0) {
      return undefined;
    }

    const normalizedTarget = this.normalizePath(projectPath);

    // Scan all base dirs to see if any slug already belongs to this project
    for (const baseDir of this.baseDirs) {
      if (!fs.existsSync(baseDir)) {
        continue;
      }

      try {
        const candidates = await fs.promises.readdir(baseDir);
        for (const candidate of candidates) {
          const markerPath = path.join(baseDir, candidate, PROJECT_ROOT_FILE);
          if (fs.existsSync(markerPath)) {
            const owner = (
              await fs.promises.readFile(markerPath, 'utf8')
            ).trim();
            if (this.normalizePath(owner) === normalizedTarget) {
              // Found it! Ensure all base dirs have the marker
              await this.ensureOwnershipMarkers(candidate, normalizedTarget);
              return candidate;
            }
          }
        }
      } catch (e) {
        debugLogger.debug(`Failed to scan base dir ${baseDir}:`, e);
      }
    }

    return undefined;
  }

  private async claimNewSlug(
    projectPath: string,
    existingMappings: Record<string, string>,
  ): Promise<string> {
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
            const owner = (
              await fs.promises.readFile(markerPath, 'utf8')
            ).trim();
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
        await this.ensureOwnershipMarkers(candidate, projectPath);
        return candidate;
      } catch (_e) {
        // Someone might have claimed it between our check and our write.
        // Try next candidate.
        continue;
      }
    }
  }

  private async ensureOwnershipMarkers(
    slug: string,
    projectPath: string,
  ): Promise<void> {
    const normalizedProject = this.normalizePath(projectPath);
    for (const baseDir of this.baseDirs) {
      const slugDir = path.join(baseDir, slug);
      if (!fs.existsSync(slugDir)) {
        await fs.promises.mkdir(slugDir, { recursive: true });
      }
      const markerPath = path.join(slugDir, PROJECT_ROOT_FILE);
      if (fs.existsSync(markerPath)) {
        const owner = (await fs.promises.readFile(markerPath, 'utf8')).trim();
        if (this.normalizePath(owner) === normalizedProject) {
          continue;
        }
        // Collision!
        throw new Error(`Slug ${slug} is already owned by ${owner}`);
      }
      // Use flag: 'wx' to ensure atomic creation
      await fs.promises.writeFile(markerPath, normalizedProject, {
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
