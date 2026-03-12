/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type ProfileDefinition,
  loadProfilesFromDir,
  loadProfileFromFile,
} from './profileLoader.js';
import { debugLogger } from '../utils/debugLogger.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export class ProfileManager {
  private profiles: Map<string, ProfileDefinition> = new Map();
  private activeProfileName: string | undefined;

  constructor(private readonly profilesDir: string) {}

  /**
   * Discovers and loads all profiles from the configured directory.
   */
  async load(): Promise<void> {
    const loaded = await loadProfilesFromDir(this.profilesDir);
    this.profiles.clear();
    for (const profile of loaded) {
      this.profiles.set(profile.name, profile);
    }
    debugLogger.log(
      `Loaded ${this.profiles.size} profiles from ${this.profilesDir}`,
    );
  }

  /**
   * Returns all discovered profiles.
   */
  getProfiles(): ProfileDefinition[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Returns a specific profile by name.
   */
  getProfile(name: string): ProfileDefinition | undefined {
    return this.profiles.get(name);
  }

  /**
   * Sets the active profile for the session.
   */
  setActiveProfile(name: string | undefined): void {
    if (name && !this.profiles.has(name)) {
      debugLogger.warn(`Attempted to activate non-existent profile: ${name}`);
      return;
    }
    this.activeProfileName = name;
  }

  /**
   * Returns the currently active profile definition.
   */
  getActiveProfile(): ProfileDefinition | undefined {
    return this.activeProfileName
      ? this.profiles.get(this.activeProfileName)
      : undefined;
  }

  /**
   * Returns the name of the active profile.
   */
  getActiveProfileName(): string | undefined {
    return this.activeProfileName;
  }

  /**
   * Returns all profiles.
   */
  getAllProfiles(): ProfileDefinition[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Links a profile from a local path.
   */
  async linkProfile(sourcePath: string): Promise<ProfileDefinition> {
    const profile = await loadProfileFromFile(sourcePath);
    if (!profile) {
      throw new Error(`Failed to load profile from ${sourcePath}`);
    }
    const targetPath = path.join(this.profilesDir, `${profile.name}.md`);

    // Create symlink
    try {
      await fs.mkdir(this.profilesDir, { recursive: true });
      await fs.symlink(path.resolve(sourcePath), targetPath);
      const linkedProfile = { ...profile, location: targetPath };
      this.profiles.set(profile.name, linkedProfile);
      debugLogger.log(
        `Linked profile ${profile.name} from ${sourcePath} to ${targetPath}`,
      );
      return linkedProfile;
    } catch (error) {
      debugLogger.error(`Failed to link profile: ${error}`);
      throw error;
    }
  }

  /**
   * Installs a profile from a local path (copies it).
   */
  async installProfile(sourcePath: string): Promise<ProfileDefinition> {
    const profile = await loadProfileFromFile(sourcePath);
    if (!profile) {
      throw new Error(`Failed to load profile from ${sourcePath}`);
    }
    const targetPath = path.join(this.profilesDir, `${profile.name}.md`);

    try {
      await fs.mkdir(this.profilesDir, { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
      const installedProfile = { ...profile, location: targetPath };
      this.profiles.set(profile.name, installedProfile);
      debugLogger.log(`Installed profile ${profile.name} to ${targetPath}`);
      return installedProfile;
    } catch (error) {
      debugLogger.error(`Failed to install profile: ${error}`);
      throw error;
    }
  }

  /**
   * Uninstalls a profile by deleting its file.
   * @param name Name of the profile to uninstall
   */
  async uninstallProfile(name: string): Promise<void> {
    const profile = this.profiles.get(name);
    if (!profile) {
      throw new Error(`Profile "${name}" not found.`);
    }

    try {
      if (fs.unlink) {
        // We are using fs/promises, so unlink is available
        const location =
          profile.location || path.join(this.profilesDir, `${profile.name}.md`);
        await fs.unlink(location);
      }
      this.profiles.delete(name);
      if (this.activeProfileName === name) {
        this.activeProfileName = undefined;
      }
    } catch (error) {
      throw new Error(
        `Failed to uninstall profile "${name}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Returns a list of all loaded profile names.
   */
  getProfileNames(): string[] {
    return Array.from(this.profiles.keys());
  }
}
