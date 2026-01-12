/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Storage } from '../config/storage.js';
import { type SkillDefinition, loadSkillsFromDir } from './skillLoader.js';
import type { GeminiCLIExtension } from '../config/config.js';

export { type SkillDefinition };

export class SkillManager {
  private skills: SkillDefinition[] = [];
  private activeSkillNames: Set<string> = new Set();
  private adminSkillsEnabled = true;
  private adminDisabledSkills: string[] = [];

  /**
   * Clears all discovered skills.
   */
  clearSkills(): void {
    this.skills = [];
  }

  /**
   * Sets administrative settings for skills.
   */
  setAdminSettings(enabled: boolean, disabled: string[]): void {
    this.adminSkillsEnabled = enabled;
    this.adminDisabledSkills = disabled.map((n) => n.toLowerCase());
  }

  /**
   * Returns true if skills are enabled by the admin.
   */
  isAdminEnabled(): boolean {
    return this.adminSkillsEnabled;
  }

  /**
   * Returns the list of skill names disabled by the admin.
   */
  getAdminDisabledSkills(): string[] {
    return this.adminDisabledSkills;
  }

  /**
   * Discovers skills from standard user and project locations, as well as extensions.
   * Precedence: Extensions (lowest) -> User -> Project (highest).
   */
  async discoverSkills(
    storage: Storage,
    extensions: GeminiCLIExtension[] = [],
  ): Promise<void> {
    this.clearSkills();

    // 1. Built-in skills (lowest precedence)
    await this.discoverBuiltinSkills();

    // 2. Extension skills
    for (const extension of extensions) {
      if (extension.isActive && extension.skills) {
        this.addSkillsWithPrecedence(extension.skills);
      }
    }

    // 3. User skills
    const userSkills = await loadSkillsFromDir(Storage.getUserSkillsDir());
    this.addSkillsWithPrecedence(userSkills);

    // 4. Project skills (highest precedence)
    const projectSkills = await loadSkillsFromDir(
      storage.getProjectSkillsDir(),
    );
    this.addSkillsWithPrecedence(projectSkills);
  }

  /**
   * Discovers built-in skills.
   */
  private async discoverBuiltinSkills(): Promise<void> {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const builtinDir = path.join(__dirname, 'builtin');

    const builtinSkills = await loadSkillsFromDir(builtinDir);

    for (const skill of builtinSkills) {
      skill.isBuiltin = true;
    }

    this.addSkillsWithPrecedence(builtinSkills);
  }

  private addSkillsWithPrecedence(newSkills: SkillDefinition[]): void {
    const skillMap = new Map<string, SkillDefinition>();
    for (const skill of [...this.skills, ...newSkills]) {
      skillMap.set(skill.name, skill);
    }
    this.skills = Array.from(skillMap.values());
  }

  /**
   * Returns the list of enabled discovered skills.
   */
  getSkills(): SkillDefinition[] {
    if (!this.adminSkillsEnabled) {
      return [];
    }
    return this.skills.filter(
      (s) =>
        !s.disabled && !this.adminDisabledSkills.includes(s.name.toLowerCase()),
    );
  }

  /**
   * Returns the list of enabled discovered skills that should be displayed in the UI.
   * This excludes built-in skills.
   */
  getDisplayableSkills(): SkillDefinition[] {
    if (!this.adminSkillsEnabled) {
      return [];
    }
    return this.skills.filter(
      (s) =>
        !s.disabled &&
        !s.isBuiltin &&
        !this.adminDisabledSkills.includes(s.name.toLowerCase()),
    );
  }

  /**
   * Returns all discovered skills, including disabled ones.
   */
  getAllSkills(): SkillDefinition[] {
    if (!this.adminSkillsEnabled) {
      return [];
    }
    return this.skills
      .filter((s) => !this.adminDisabledSkills.includes(s.name.toLowerCase()))
      .map((s) => ({
        ...s,
      }));
  }

  /**
   * Filters discovered skills by name.
   */
  filterSkills(predicate: (skill: SkillDefinition) => boolean): void {
    this.skills = this.skills.filter(predicate);
  }

  /**
   * Sets the list of disabled skill names.
   */
  setDisabledSkills(disabledNames: string[]): void {
    const lowercaseDisabledNames = disabledNames.map((n) => n.toLowerCase());
    for (const skill of this.skills) {
      skill.disabled = lowercaseDisabledNames.includes(
        skill.name.toLowerCase(),
      );
    }
  }

  /**
   * Reads the full content (metadata + body) of a skill by name.
   */
  getSkill(name: string): SkillDefinition | null {
    if (!this.adminSkillsEnabled) {
      return null;
    }
    const lowercaseName = name.toLowerCase();
    if (this.adminDisabledSkills.includes(lowercaseName)) {
      return null;
    }
    return (
      this.skills.find((s) => s.name.toLowerCase() === lowercaseName) ?? null
    );
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
}
