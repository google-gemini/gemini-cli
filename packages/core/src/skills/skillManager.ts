/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Storage } from '../config/storage.js';
import { type SkillDefinition, loadSkillsFromDir } from './skillLoader.js';
import type { GeminiCLIExtension } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents } from '../utils/events.js';

export { type SkillDefinition };

export class SkillManager {
  private skills: SkillDefinition[] = [];
  private activeSkillNames: Set<string> = new Set();
  private adminSkillsEnabled = true;

  /**
   * Clears all discovered skills.
   */
  clearSkills(): void {
    this.skills = [];
  }

  /**
   * Resets session-scoped state (active skill names).
   */
  reset(): void {
    this.activeSkillNames.clear();
  }

  /**
   * Sets administrative settings for skills.
   */
  setAdminSettings(enabled: boolean): void {
    this.adminSkillsEnabled = enabled;
  }

  /**
   * Returns true if skills are enabled by the admin.
   */
  isAdminEnabled(): boolean {
    return this.adminSkillsEnabled;
  }

  /**
   * Discovers skills from standard user and workspace locations, as well as extensions.
   * Precedence: Extensions (lowest) -> User -> Workspace (highest).
   */
  async discoverSkills(
    storage: Storage,
    extensions: GeminiCLIExtension[] = [],
    isTrusted: boolean = false,
  ): Promise<void> {
    this.clearSkills();

    // Directories already scanned, tracked by their physical (real) path so
    // that symlinked/junctioned aliases are not discovered twice.
    const visitedDirs = new Set<string>();

    // 1. Built-in skills (lowest precedence)
    await this.discoverBuiltinSkills();

    // 2. Extension skills
    for (const extension of extensions) {
      if (extension.isActive && extension.skills) {
        this.addSkillsWithPrecedence(extension.skills);
      }
    }

    // 3. User skills
    const userSkills = await this.loadSkillsFromUniqueDir(
      Storage.getUserSkillsDir(),
      visitedDirs,
    );
    this.addSkillsWithPrecedence(userSkills);

    // 3.1 User agent skills alias (.agents/skills)
    const userAgentSkills = await this.loadSkillsFromUniqueDir(
      Storage.getUserAgentSkillsDir(),
      visitedDirs,
    );
    this.addSkillsWithPrecedence(userAgentSkills);

    // 4. Workspace skills (highest precedence)
    if (!isTrusted) {
      debugLogger.debug(
        'Workspace skills disabled because folder is not trusted.',
      );
      return;
    }

    const projectSkills = await this.loadSkillsFromUniqueDir(
      storage.getProjectSkillsDir(),
      visitedDirs,
    );
    this.addSkillsWithPrecedence(projectSkills);

    // 4.1 Workspace agent skills alias (.agents/skills)
    const projectAgentSkills = await this.loadSkillsFromUniqueDir(
      storage.getProjectAgentSkillsDir(),
      visitedDirs,
    );
    this.addSkillsWithPrecedence(projectAgentSkills);
  }

  /**
   * Loads skills from a directory unless it resolves to a physical directory
   * that was already scanned. This prevents duplicate skill warnings when
   * e.g. `.gemini` is a symlink or Windows junction pointing at `.agents`
   * (or vice versa), which would otherwise cause the same skills to be
   * discovered once per alias path.
   */
  private async loadSkillsFromUniqueDir(
    dir: string,
    visitedDirs: Set<string>,
  ): Promise<SkillDefinition[]> {
    let realDir = path.resolve(dir);
    try {
      realDir = await fs.realpath(realDir);
    } catch {
      // The directory may not exist; fall back to the resolved path.
    }
    if (visitedDirs.has(realDir)) {
      debugLogger.debug(
        `Skipping skill discovery for "${dir}": it resolves to "${realDir}", which has already been scanned.`,
      );
      return [];
    }
    visitedDirs.add(realDir);
    return loadSkillsFromDir(dir);
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

  /**
   * Adds skills to the manager programmatically.
   */
  addSkills(skills: SkillDefinition[]): void {
    this.addSkillsWithPrecedence(skills);
  }

  private addSkillsWithPrecedence(newSkills: SkillDefinition[]): void {
    const skillMap = new Map<string, SkillDefinition>(
      this.skills.map((s) => [s.name, s]),
    );

    for (const newSkill of newSkills) {
      const existingSkill = skillMap.get(newSkill.name);
      if (existingSkill && existingSkill.location !== newSkill.location) {
        if (existingSkill.isBuiltin) {
          debugLogger.warn(
            `Skill "${newSkill.name}" from "${newSkill.location}" is overriding the built-in skill.`,
          );
        } else {
          coreEvents.emitFeedback(
            'warning',
            `Skill conflict detected: "${newSkill.name}" from "${newSkill.location}" is overriding the same skill from "${existingSkill.location}".`,
          );
        }
      }
      skillMap.set(newSkill.name, newSkill);
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
    const lowercaseName = name.toLowerCase();
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
