/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Storage } from '../config/storage.js';
import {
  type SkillDefinition,
  type SkillDiscoveryReport,
  loadSkillsFromDirWithReport,
} from './skillLoader.js';
import type { GeminiCLIExtension } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents } from '../utils/events.js';

export { type SkillDefinition };

export class SkillManager {
  private skills: SkillDefinition[] = [];
  private activeSkillNames: Set<string> = new Set();
  private adminSkillsEnabled = true;
  private latestDiscoveryReport: SkillDiscoveryReport[] = [];
  private discoveryReportBySkillLocation = new Map<string, SkillDiscoveryReport>();

  /**
   * Clears all discovered skills.
   */
  clearSkills(): void {
    this.skills = [];
    this.latestDiscoveryReport = [];
    this.discoveryReportBySkillLocation.clear();
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

    // 1. Built-in skills (lowest precedence)
    await this.discoverBuiltinSkills();

    // 2. Extension skills
    for (const extension of extensions) {
      if (extension.isActive && extension.skills) {
        if (extension.skillsDiscoveryReport) {
          this.trackDiscoveryReport(
            extension.skillsDiscoveryReport,
            extension.skills,
          );
        }
        this.addSkillsWithPrecedence(extension.skills);
      }
    }

    // 3. User skills
    const userSkills = await this.loadAndTrackSkills(
      Storage.getUserSkillsDir(),
    );
    this.addSkillsWithPrecedence(userSkills);

    // 3.1 User agent skills alias (.agents/skills)
    const userAgentSkills = await this.loadAndTrackSkills(
      Storage.getUserAgentSkillsDir(),
    );
    this.addSkillsWithPrecedence(userAgentSkills);

    // 4. Workspace skills (highest precedence)
    if (!isTrusted) {
      debugLogger.debug(
        'Workspace skills disabled because folder is not trusted.',
      );
      return;
    }

    const projectSkills = await this.loadAndTrackSkills(
      storage.getProjectSkillsDir(),
    );
    this.addSkillsWithPrecedence(projectSkills);

    // 4.1 Workspace agent skills alias (.agents/skills)
    const projectAgentSkills = await this.loadAndTrackSkills(
      storage.getProjectAgentSkillsDir(),
    );
    this.addSkillsWithPrecedence(projectAgentSkills);
  }

  /**
   * Discovers built-in skills.
   */
  private async discoverBuiltinSkills(): Promise<void> {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const builtinDir = path.join(__dirname, 'builtin');

    const builtinSkills = await this.loadAndTrackSkills(builtinDir);

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

  getLatestDiscoveryReport(): SkillDiscoveryReport[] {
    return this.latestDiscoveryReport;
  }

  getDiscoveryReportForSkill(
    location: string,
  ): SkillDiscoveryReport | undefined {
    const directReport = this.discoveryReportBySkillLocation.get(location);
    if (directReport) {
      return directReport;
    }

    return this.latestDiscoveryReport
      .filter((report) => {
        const resolvedLocation = path.resolve(location);
        const resolvedSourceDir = path.resolve(report.source_dir);
        return (
          resolvedLocation === resolvedSourceDir ||
          this.isSubpath(resolvedSourceDir, resolvedLocation)
        );
      })
      .sort((a, b) => b.source_dir.length - a.source_dir.length)[0];
  }

  getSlowestSkillLoadTime(thresholdMs = 100): number | null {
    const durations = this.latestDiscoveryReport
      .flatMap((report) => report.skill_metrics)
      .filter((metric) => metric.parse_result === 'loaded')
      .map((metric) => metric.duration_ms)
      .filter((duration) => duration >= thresholdMs);

    if (durations.length === 0) {
      return null;
    }

    return Math.max(...durations);
  }

  private async loadAndTrackSkills(dir: string): Promise<SkillDefinition[]> {
    const { skills, report } = await loadSkillsFromDirWithReport(dir);
    this.trackDiscoveryReport(report, skills);
    return skills;
  }

  private trackDiscoveryReport(
    report: SkillDiscoveryReport,
    skills: readonly SkillDefinition[],
  ): void {
    this.latestDiscoveryReport.push(report);
    for (const skill of skills) {
      this.discoveryReportBySkillLocation.set(skill.location, report);
    }
  }

  private isSubpath(parentPath: string, childPath: string): boolean {
    const relative = path.relative(parentPath, childPath);
    return (
      relative === '' ||
      (!relative.startsWith('..') && !path.isAbsolute(relative))
    );
  }
}
