/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage } from '../config/storage.js';
import { type SkillDefinition, loadSkillsFromDir } from './skillLoader.js';

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
   * Discovers skills from standard user and project locations.
   * Project skills take precedence over user skills.
   */
  async discoverSkills(storage: Storage): Promise<void> {
    this.clearSkills();

    // 1. User skills
    const userSkills = await loadSkillsFromDir(Storage.getUserSkillsDir());
    this.addSkillsWithPrecedence(userSkills);

    // 2. Project skills (highest precedence)
    const projectSkills = await loadSkillsFromDir(
      storage.getProjectSkillsDir(),
    );
    this.addSkillsWithPrecedence(projectSkills);
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
