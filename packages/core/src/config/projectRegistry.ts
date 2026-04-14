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

class SlugCollisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlugCollisionError';
  }
}

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

      // Cleanup orphaned .tmp files in the background without blocking initialization
      this.cleanupOrphanedTempFiles().catch((e) => {
        debugLogger.debug('Failed to cleanup orphaned temp files', e);
      });
    })();

    return this.initPromise;
  }

  private async cleanupOrphanedTempFiles(): Promise<void> {
    const dir = path.dirname(this.registryPath);
    const baseName = path.basename(this.registryPath);

    try {
      const files = await fs.promises.readdir(dir);
      const now = Date.now();

      for (const file of files) {
        if (file.startsWith(`${baseName}.`) && file.endsWith('.tmp')) {
          const filePath = path.join(dir, file);
          try {
            const stats = await fs.promises.stat(filePath);
            // Delete if older than 1 hour (3,600,000 ms) to avoid deleting actively written files
            if (now - stats.mtimeMs > 3600000) {
              await fs.promises.unlink(filePath);
            }
          } catch {
            // Ignore stat or unlink errors (e.g., if the file was just successfully renamed by another process)
          }
        }
      }
    } catch (e: unknown) {
      // Directory might not exist yet or be unreadable.
      // We log at debug level rather than swallowing silently so leaks can be investigated.
      debugLogger.debug(
        'Failed to read directory for orphaned temp file cleanup:',
        e,
      );
    }
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
    try {
      // Resolve symlinks and Windows shortnames to get the true physical path.
      // We use the sync version because this is called synchronously across the system.
      resolved = fs.realpathSync.native(resolved);
    } catch {
      // Ignore errors if the path doesn't exist yet on disk
    }

    if (os.platform() === 'win32') {
      resolved = resolved.toLowerCase();
    }
    return resolved;
  }

  private async save(data: RegistryData): Promise<void> {
    const dir = path.dirname(this.registryPath);
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
    await fs.promises.mkdir(dir, { recursive: true });

    // Atomic creation: Prevents TOCTOU races by asking the OS to create the file
    // only if it doesn't exist. If another CLI instance beats us to it, it throws EEXIST.
    try {
      await fs.promises.writeFile(
        this.registryPath,
        JSON.stringify({ projects: {} }),
        { flag: 'wx' },
      );
    } catch (error: unknown) {
      if (isNodeError(error) && error.code !== 'EEXIST') {
        throw error;
      }
      // EEXIST means the file is already there, which is exactly what we want.
    }

    // Now that the file is guaranteed to exist, we can safely lock it.
    const release = await lock(this.registryPath, {
      retries: {
        retries: Math.floor(LOCK_TIMEOUT_MS / LOCK_RETRY_DELAY_MS),
        minTimeout: LOCK_RETRY_DELAY_MS,
      },
    });

    try {
      // Re-load data under lock to get the latest state
      const currentData = await this.loadData();

      // JIT Migration: Normalize all existing keys in the loaded registry.
      // This ensures backward compatibility with older registries that
      // stored paths before realpath or lowercase normalization was introduced.
      const migratedProjects: Record<string, string> = {};
      for (const [oldPath, existingSlug] of Object.entries(
        currentData.projects,
      )) {
        const migratedPath = this.normalizePath(oldPath);
        migratedProjects[migratedPath] = existingSlug;
      }
      currentData.projects = migratedProjects;
      this.data = currentData;

      let shortId: string | undefined = currentData.projects[normalizedPath];

      // If we have a mapping, verify it against the folders on disk
      if (shortId) {
        if (await this.verifySlugOwnership(shortId, normalizedPath)) {
          // HEAL: If it passed verification but markers are missing (e.g. new base dir or deleted marker), recreate them.
          try {
            await this.ensureOwnershipMarkers(shortId, normalizedPath);
            return shortId;
          } catch (e) {
            if (!(e instanceof SlugCollisionError)) {
              throw e; // Bubble up true filesystem failures (EACCES, ENOSPC)
            }
            // If it's a collision during healing, someone else stole the slug.
            // We will just fall through to delete the mapping and generate a new one.
          }
        }
        // If verification fails or healing collides, it means the registry is out of sync.
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
    const normalizedTarget = this.normalizePath(projectPath);

    // Scan all base dirs to see if any slug already belongs to this project
    for (const baseDir of this.baseDirs) {
      let candidates: string[];
      try {
        candidates = await fs.promises.readdir(baseDir);
      } catch (e: unknown) {
        if (isNodeError(e) && e.code === 'ENOENT') {
          continue; // Base dir doesn't exist yet
        }
        debugLogger.debug(`Failed to scan base dir ${baseDir}:`, e);
        continue;
      }

      for (const candidate of candidates) {
        const markerPath = path.join(baseDir, candidate, PROJECT_ROOT_FILE);
        try {
          const owner = (await fs.promises.readFile(markerPath, 'utf8')).trim();
          if (this.normalizePath(owner) === normalizedTarget) {
            // Found it! Ensure all base dirs have the marker
            try {
              await this.ensureOwnershipMarkers(candidate, normalizedTarget);
              return candidate;
            } catch (e) {
              if (e instanceof SlugCollisionError) {
                // Split-brain scenario: This candidate is valid in this baseDir,
                // but collides with a different project in another baseDir.
                // Abandon this corrupted candidate and keep searching.
                continue;
              }
              throw e;
            }
          }
        } catch (e: unknown) {
          if (isNodeError(e) && e.code === 'ENOENT') {
            continue; // No marker, not a project dir
          }
          debugLogger.debug(`Failed to read marker ${markerPath}:`, e);
        }
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
    const maxAttempts = 1000;

    while (counter < maxAttempts) {
      const candidate = counter === 0 ? slug : `${slug}-${counter}`;
      counter++;

      // Check if taken in registry
      if (existingIds.has(candidate)) {
        continue;
      }

      // Try to claim it atomically on disk across all base dirs
      try {
        await this.ensureOwnershipMarkers(candidate, projectPath);
        return candidate;
      } catch (e) {
        if (e instanceof SlugCollisionError) {
          // Try the next candidate.
          continue;
        }
        // If it's a real filesystem error (e.g. ENOSPC, EACCES), do not swallow it.
        throw e;
      }
    }

    throw new Error(
      `Failed to claim a unique slug for ${projectPath} after ${maxAttempts} attempts. The filesystem may be corrupted.`,
    );
  }

  private async ensureOwnershipMarkers(
    slug: string,
    projectPath: string,
  ): Promise<void> {
    const normalizedProject = this.normalizePath(projectPath);
    for (const baseDir of this.baseDirs) {
      const slugDir = path.join(baseDir, slug);
      await fs.promises.mkdir(slugDir, { recursive: true });

      const markerPath = path.join(slugDir, PROJECT_ROOT_FILE);

      while (true) {
        try {
          // Use flag: 'wx' to ensure atomic creation. Fails with EEXIST if it already exists.
          await fs.promises.writeFile(markerPath, normalizedProject, {
            encoding: 'utf8',
            flag: 'wx',
          });
          break; // Created successfully
        } catch (error: unknown) {
          if (isNodeError(error) && error.code === 'EEXIST') {
            // It already exists. Let's see who owns it to resolve the race condition.
            try {
              const owner = (
                await fs.promises.readFile(markerPath, 'utf8')
              ).trim();
              if (this.normalizePath(owner) === normalizedProject) {
                break; // We won the race (or a previous execution of ours did)
              }
              // Collision! Someone else beat us to it.
              throw new SlugCollisionError(
                `Slug ${slug} is already owned by ${owner}`,
              );
            } catch (readError: unknown) {
              if (isNodeError(readError) && readError.code === 'ENOENT') {
                // The file vanished between our EEXIST and readFile.
                // Loop around and try creating it again.
                continue;
              }
              throw readError;
            }
          }
          throw error;
        }
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
