/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import yaml from 'js-yaml';
import { debugLogger } from '../utils/debugLogger.js';
import { Storage } from '../config/storage.js';

export interface SkillMetadata {
  name: string;
  description: string;
  location: string;
  body: string;
  disabled?: boolean;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)/;

export class SkillManager {
  private skills: SkillMetadata[] = [];
  private activeSkillNames: Set<string> = new Set();

  /**
   * Clears all discovered skills.
   */
  clearSkills(): void {
    this.skills = [];
  }

  /**
   * Discovers skills from standard user and project locations.
   * Project skills take precedence over user skills.
   */
  async discoverSkills(storage: Storage): Promise<void> {
    this.clearSkills();

    // User skills first
    const userPaths = [Storage.getUserSkillsDir()];
    const userSkills = await this.discoverSkillsInternal(userPaths);
    this.addSkillsWithPrecedence(userSkills);

    // Project skills second (overwrites user skills with same name)
    const projectPaths = [storage.getProjectSkillsDir()];
    const projectSkills = await this.discoverSkillsInternal(projectPaths);
    this.addSkillsWithPrecedence(projectSkills);
  }

  private addSkillsWithPrecedence(newSkills: SkillMetadata[]): void {
    const skillMap = new Map<string, SkillMetadata>();
    for (const skill of [...this.skills, ...newSkills]) {
      skillMap.set(skill.name, skill);
    }
    this.skills = Array.from(skillMap.values());
  }

  /**
   * Discovered skills in the provided paths and adds them to the manager.
   * Internal helper for tiered discovery.
   */
  async discoverSkillsInternal(paths: string[]): Promise<SkillMetadata[]> {
    const discoveredSkills: SkillMetadata[] = [];
    const seenLocations = new Set(this.skills.map((s) => s.location));

    for (const searchPath of paths) {
      try {
        const absoluteSearchPath = path.resolve(searchPath);
        debugLogger.debug(`Discovering skills in: ${absoluteSearchPath}`);

        const stats = await fs.stat(absoluteSearchPath).catch(() => null);
        if (!stats || !stats.isDirectory()) {
          debugLogger.debug(
            `Search path is not a directory: ${absoluteSearchPath}`,
          );
          continue;
        }

        const skillFiles = await glob('*/SKILL.md', {
          cwd: absoluteSearchPath,
          absolute: true,
          nodir: true,
        });

        debugLogger.debug(
          `Found ${skillFiles.length} potential skill files in ${absoluteSearchPath}`,
        );

        for (const skillFile of skillFiles) {
          if (seenLocations.has(skillFile)) {
            continue;
          }

          const metadata = await this.parseSkillFile(skillFile);
          if (metadata) {
            debugLogger.debug(
              `Discovered skill: ${metadata.name} at ${skillFile}`,
            );
            discoveredSkills.push(metadata);
            seenLocations.add(skillFile);
          }
        }
      } catch (error) {
        debugLogger.log(`Error discovering skills in ${searchPath}:`, error);
      }
    }

    return discoveredSkills;
  }

  /**
   * Returns the list of enabled discovered skills.
   */
  getSkills(): SkillMetadata[] {
    return this.skills.filter((s) => !s.disabled);
  }

  /**
   * Returns all discovered skills, including disabled ones.
   */
  getAllSkills(): SkillMetadata[] {
    return this.skills;
  }

  /**
   * Filters discovered skills by name.
   */
  filterSkills(predicate: (skill: SkillMetadata) => boolean): void {
    this.skills = this.skills.filter(predicate);
  }

  /**
   * Sets the list of disabled skill names.
   */
  setDisabledSkills(disabledNames: string[]): void {
    for (const skill of this.skills) {
      skill.disabled = disabledNames.includes(skill.name);
    }
  }

  /**
   * Reads the full content (metadata + body) of a skill by name.
   */
  getSkill(name: string): SkillMetadata | null {
    return this.skills.find((s) => s.name === name) ?? null;
  }

  /**
   * Activates a skill by name.
   */
  activateSkill(name: string): void {
    this.activeSkillNames.add(name);
  }

  /**
   * Checks if a skill is active.
   */
  isSkillActive(name: string): boolean {
    return this.activeSkillNames.has(name);
  }

  private async parseSkillFile(
    filePath: string,
  ): Promise<SkillMetadata | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const match = content.match(FRONTMATTER_REGEX);
      if (!match) {
        return null;
      }

      // Use yaml.load() which is safe in js-yaml v4.
      const frontmatter = yaml.load(match[1]);
      if (!frontmatter || typeof frontmatter !== 'object') {
        return null;
      }

      const { name, description } = frontmatter as Record<string, unknown>;
      if (typeof name !== 'string' || typeof description !== 'string') {
        return null;
      }

      return {
        name,
        description,
        location: filePath,
        body: match[2].trim(),
      };
    } catch (error) {
      debugLogger.log(`Error parsing skill file ${filePath}:`, error);
      return null;
    }
  }
}
