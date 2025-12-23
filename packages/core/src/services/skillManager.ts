/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import yaml from 'js-yaml';

export interface SkillMetadata {
  name: string;
  description: string;
  location: string;
  disabled?: boolean;
}

export interface SkillContent extends SkillMetadata {
  body: string; // The Markdown content after the frontmatter
}

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
   * Discovered skills in the provided paths and adds them to the manager.
   * A skill is a directory containing a SKILL.md file at its root.
   */
  async discoverSkills(paths: string[]): Promise<SkillMetadata[]> {
    const discoveredSkills: SkillMetadata[] = [];
    const seenLocations = new Set(this.skills.map((s) => s.location));

    for (const searchPath of paths) {
      try {
        const absoluteSearchPath = path.resolve(searchPath);

        // Check if the search path itself is a directory
        const stats = await fs.stat(absoluteSearchPath).catch(() => null);
        if (!stats || !stats.isDirectory()) {
          continue;
        }

        // Search for SKILL.md files in immediate subdirectories
        // We use a depth of 2 to find <searchPath>/<skill-name>/SKILL.md
        const skillFiles = await glob('*/SKILL.md', {
          cwd: absoluteSearchPath,
          absolute: true,
          nodir: true,
        });

        for (const skillFile of skillFiles) {
          if (seenLocations.has(skillFile)) {
            continue;
          }

          const metadata = await this.parseSkillFile(skillFile);
          if (metadata) {
            discoveredSkills.push(metadata);
            seenLocations.add(skillFile);
          }
        }
      } catch (error) {
        // Silently ignore errors for individual search paths
        console.error(`Error discovering skills in ${searchPath}:`, error);
      }
    }

    // Deduplicate by name, last one wins
    const skillMap = new Map<string, SkillMetadata>();
    for (const skill of [...this.skills, ...discoveredSkills]) {
      skillMap.set(skill.name, skill);
    }
    this.skills = Array.from(skillMap.values());

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
  async getSkillContent(name: string): Promise<SkillContent | null> {
    const skill = this.skills.find((s) => s.name === name);
    if (!skill) {
      return null;
    }
    const filePath = skill.location;
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Extract YAML frontmatter
      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)/);
      if (!match) {
        return null;
      }

      const frontmatter = yaml.load(match[1]);
      if (!frontmatter || typeof frontmatter !== 'object') {
        return null;
      }

      const { name: skillName, description } = frontmatter as Record<
        string,
        unknown
      >;
      if (typeof skillName !== 'string' || typeof description !== 'string') {
        return null;
      }

      return {
        name: skillName,
        description,
        location: filePath,
        body: match[2].trim(),
      };
    } catch (error) {
      console.error(`Error reading skill content from ${filePath}:`, error);
      return null;
    }
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

      // Extract YAML frontmatter
      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      if (!match) {
        return null;
      }

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
      };
    } catch (error) {
      console.error(`Error parsing skill file ${filePath}:`, error);
      return null;
    }
  }
}
