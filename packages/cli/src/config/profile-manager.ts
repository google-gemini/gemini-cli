/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { load } from 'js-yaml';
import { z } from 'zod';
import { Storage, getErrorMessage } from '@google/gemini-cli-core';
import { type LoadedSettings, SettingScope } from './settings.js';

export const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---(?:\n([\s\S]*))?$/;

const profileFrontmatterSchema = z.object({
  name: z.string().regex(/^[a-z0-9-_]+$/, 'Name must be a valid slug'),
  description: z.string().optional(),
  extensions: z.array(z.string()).optional(),
  default_model: z.string().optional(),
});

export type ProfileFrontmatter = z.infer<typeof profileFrontmatterSchema>;

export interface Profile {
  name: string;
  frontmatter: ProfileFrontmatter;
  context: string;
  filePath: string;
}

/**
 * Manages the lifecycle of user profiles.
 * Profiles are stored as Markdown files with YAML frontmatter in ~/.gemini/profiles/.
 */
export class ProfileManager {
  private profilesDir: string;

  constructor(private settings: LoadedSettings) {
    this.profilesDir = Storage.getProfilesDir();
  }

  /**
   * Ensures the profiles directory exists.
   */
  async ensureProfilesDir(): Promise<void> {
    try {
      if (!existsSync(this.profilesDir)) {
        await fs.mkdir(this.profilesDir, { recursive: true });
      }
    } catch (error) {
      throw new Error(
        `Failed to create profiles directory at ${this.profilesDir}: ${getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Lists the names of all available profiles.
   * @returns A list of profile names (filenames without .md extension).
   */
  async listProfiles(): Promise<string[]> {
    try {
      if (!existsSync(this.profilesDir)) {
        return [];
      }
      const entries = await fs.readdir(this.profilesDir, {
        withFileTypes: true,
      });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => path.basename(entry.name, '.md'));
    } catch (error) {
      throw new Error(`Failed to list profiles: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Loads and parses a profile by its name.
   * @param name The name of the profile to load.
   * @returns The parsed Profile object, or null if not found.
   * @throws Error if the profile exists but is malformed or invalid.
   */
  async getProfile(name: string): Promise<Profile | null> {
    const filePath = path.join(this.profilesDir, `${name}.md`);

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return null;
      }
      throw new Error(
        `Failed to read profile "${name}": ${getErrorMessage(error)}`,
      );
    }

    try {
      const match = content.match(FRONTMATTER_REGEX);
      if (!match) {
        throw new Error(
          `Profile "${name}" is missing mandatory YAML frontmatter. Ensure it starts and ends with "---".`,
        );
      }

      const frontmatterStr = match[1];
      const context = match[2]?.trim() || '';

      const rawFrontmatter = load(frontmatterStr);
      const result = profileFrontmatterSchema.safeParse(rawFrontmatter);

      if (!result.success) {
        // Collect and format validation errors for a better user experience
        const issues = result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join(', ');
        throw new Error(`Validation failed for profile "${name}": ${issues}`);
      }

      const frontmatter = result.data;
      if (frontmatter.name !== name) {
        throw new Error(
          `Profile name in frontmatter (${frontmatter.name}) must match filename (${name}).`,
        );
      }

      return {
        name,
        frontmatter,
        context,
        filePath,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Validation failed')
      ) {
        throw error;
      }
      throw new Error(
        `Failed to parse profile "${name}": ${getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Gets the name of the currently active profile from settings.
   */
  getActiveProfileName(): string | undefined {
    return this.settings.merged.general?.activeProfile;
  }

  /**
   * Persistently enables a profile by updating user settings.
   * @param name The name of the profile to enable.
   * @throws Error if the profile does not exist.
   */
  async enableProfile(name: string): Promise<void> {
    const profile = await this.getProfile(name);
    if (!profile) {
      throw new Error(`Profile "${name}" not found. Cannot enable.`);
    }
    this.settings.setValue(SettingScope.User, 'general.activeProfile', name);
  }

  /**
   * Disables the currently active profile.
   */
  disableProfile(): void {
    this.settings.setValue(
      SettingScope.User,
      'general.activeProfile',
      undefined,
    );
  }

  /**
   * Uninstalls (deletes) a profile.
   * If the profile is active, it will be disabled first.
   * @param name The name of the profile to uninstall.
   * @throws Error if the profile does not exist or deletion fails.
   */
  async uninstallProfile(name: string): Promise<void> {
    const filePath = path.join(this.profilesDir, `${name}.md`);
    if (!existsSync(filePath)) {
      throw new Error(`Profile "${name}" not found. Cannot uninstall.`);
    }

    if (this.getActiveProfileName() === name) {
      this.disableProfile();
    }

    try {
      await fs.rm(filePath);
    } catch (error) {
      throw new Error(
        `Failed to delete profile file for "${name}": ${getErrorMessage(error)}`,
      );
    }
  }
}
