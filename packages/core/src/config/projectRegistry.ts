/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { lock } from 'proper-lockfile';
import { debugLogger } from '../utils/debugLogger.js';
import { isNodeError } from '../utils/errors.js';

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
    try {
      const content = await fs.promises.readFile(this.registryPath, 'utf8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(content);
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return { projects: {} }; // Normal first run
      }
      if (error instanceof SyntaxError) {
        debugLogger.warn(
          'Failed to load registry (JSON corrupted), resetting to empty: ',
          error,
        );
        // Ownership markers on disk will allow self-healing when short IDs are requested.
        return { projects: {} };
      }

      // If it's a real filesystem error (e.g. EACCES permission denied), DO NOT swallow it.
      // Swallowing read errors and overwriting the file would permanently destroy user data.
      debugLogger.error('Critical failure reading project registry:', error);
      throw error;
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
    // Use a randomized tmp path to avoid ENOENT crashes when save() is called concurrently
    const tmpPath = this.registryPath + '.' + randomUUID() + '.tmp';
    let savedSuccessfully = false;

    try {
      // Unconditionally ensure the directory exists; recursive ignores EEXIST.
      await fs.promises.mkdir(dir, { recursive: true });

      const content = JSON.stringify(data, null, 2);
      await fs.promises.writeFile(tmpPath, content, 'utf8');

      // Exponential backoff for OS-level file locks (EBUSY/EPERM) during rename
      const maxRetries = 5;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          await fs.promises.rename(tmpPath, this.registryPath);
          savedSuccessfully = true;
          break; // Success, exit the retry loop
        } catch (error: unknown) {
          const code = isNodeError(error) ? error.code : '';
          const isRetryable = code === 'EBUSY' || code === 'EPERM';

          if (!isRetryable || attempt === maxRetries - 1) {
            throw error; // Throw immediately on fatal error or final attempt
          }

          const delayMs = Math.pow(2, attempt) * 50;
          debugLogger.debug(
            `Rename failed with ${code}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    } catch (error) {
      debugLogger.error(
        `Failed to save project registry to ${this.registryPath}:`,
        error,
      );
      throw error;
    } finally {
      // Clean up the temporary file if it was left behind (e.g. if writeFile or rename failed)
      if (!savedSuccessfully) {
        try {
          await fs.promises.unlink(tmpPath);
        } catch {
          // Ignore errors during cleanup
        }
      }
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
    // Ensure the registry file exists so proper-lockfile can lock it.
    // If it doesn't exist, we try to create it. If someone else creates it
    // between our check and our write, we just continue.
    if (!fs.existsSync(this.registryPath)) {
      try {
        await this.save({ projects: {} });
      } catch (e: unknown) {
        if (!fs.existsSync(this.registryPath)) {
          throw e; // File still doesn't exist and save failed, this is a real error.
        }
        // Someone else created it while we were trying to save. Continue to locking.
      }
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
      try {
        await release();
      } catch (e) {
        // Prevent proper-lockfile errors (e.g. if the lock dir was externally deleted)
        // from masking the original error thrown inside the try block.
        debugLogger.error('Failed to release project registry lock:', e);
      }
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
      try {
        const owner = (await fs.promises.readFile(markerPath, 'utf8')).trim();
        if (this.normalizePath(owner) !== this.normalizePath(projectPath)) {
          return false;
        }
      } catch (e: unknown) {
        if (isNodeError(e) && e.code === 'ENOENT') {
          // Marker doesn't exist, this is fine, we just won't fail verification
          continue;
        }
        debugLogger.debug(`Failed to read ownership marker ${markerPath}:`, e);
        // If we can't read it for other reasons (perms, corrupted), assume not ours.
        return false;
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
          } catch {
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
      } catch (error: unknown) {
        // Only retry if it was a collision (someone else took the slug)
        // or a race condition during marker creation.
        const code = isNodeError(error) ? error.code : '';
        const isCollision =
          code === 'EEXIST' ||
          (error instanceof Error &&
            error.message.includes('already owned by'));

        if (isCollision) {
          debugLogger.debug(`Slug collision for ${candidate}, trying next...`);
          continue;
        }

        // Fatal error (Permission denied, Disk full, etc.)
        throw error;
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
        const error = Object.assign(
          new Error(`Slug ${slug} is already owned by ${owner}`),
          { code: 'EEXIST' },
        );
        throw error;
      }
      // Use flag: 'wx' to ensure atomic creation
      try {
        await fs.promises.writeFile(markerPath, normalizedProject, {
          encoding: 'utf8',
          flag: 'wx',
        });
      } catch (e: unknown) {
        if (isNodeError(e) && e.code === 'EEXIST') {
          // Re-verify ownership in case we just lost a race
          const owner = (await fs.promises.readFile(markerPath, 'utf8')).trim();
          if (this.normalizePath(owner) === normalizedProject) {
            continue;
          }
        }
        throw e;
      }
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
