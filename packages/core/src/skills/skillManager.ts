/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage } from '../config/storage.js';
import { type SkillDefinition, loadSkillsFromDir } from './skillLoader.js';
import type { GeminiCLIExtension } from '../config/config.js';

export { type SkillDefinition };

export class SkillManager {
  private skills: SkillDefinition[] = [];
  private activeSkillNames: Set<string> = new Set();

  /**
   * Clears all discovered skills.
   */
  clearSkills(): void {
    this.skills = [];
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
    // Built-in skills can be added here.
    // For now, this is a placeholder for where built-in skills will be loaded from.
    // They could be loaded from a specific directory within the package.
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
    return this.skills.filter((s) => !s.disabled);
  }

  /**
   * Returns the list of enabled discovered skills that should be displayed in the UI.
   * This excludes built-in skills.
   */
  getDisplayableSkills(): SkillDefinition[] {
    return this.skills.filter((s) => !s.disabled && !s.isBuiltin);
  }

  /**
   * Returns all discovered skills, including disabled ones.
   */
  getAllSkills(): SkillDefinition[] {
    return this.skills;
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
    for (const skill of this.skills) {
      skill.disabled = disabledNames.includes(skill.name);
    }
  }

  /**
   * Reads the full content (metadata + body) of a skill by name.
   */
  getSkill(name: string): SkillDefinition | null {
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
}
