/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SettingScope } from '../config/settings.js';
import type { SkillActionResult } from './skillSettings.js';
import {
  Storage,
  loadSkillsFromDir,
  type SkillDefinition,
} from '@google/gemini-cli-core';
import { cloneFromGit } from '../config/extensions/github.js';
import extract from 'extract-zip';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Shared logic for building the core skill action message while allowing the
 * caller to control how each scope and its path are rendered (e.g., bolding or
 * dimming).
 *
 * This function ONLY returns the description of what happened. It is up to the
 * caller to append any interface-specific guidance (like "Use /skills reload"
 * or "Restart required").
 */
export function renderSkillActionFeedback(
  result: SkillActionResult,
  formatScope: (label: string, path: string) => string,
): string {
  const { skillName, action, status, error } = result;

  if (status === 'error') {
    return (
      error ||
      `An error occurred while attempting to ${action} skill "${skillName}".`
    );
  }

  if (status === 'no-op') {
    return `Skill "${skillName}" is already ${action === 'enable' ? 'enabled' : 'disabled'}.`;
  }

  const isEnable = action === 'enable';
  const actionVerb = isEnable ? 'enabled' : 'disabled';
  const preposition = isEnable
    ? 'by removing it from the disabled list in'
    : 'by adding it to the disabled list in';

  const formatScopeItem = (s: { scope: SettingScope; path: string }) => {
    const label =
      s.scope === SettingScope.Workspace ? 'workspace' : s.scope.toLowerCase();
    return formatScope(label, s.path);
  };

  const totalAffectedScopes = [
    ...result.modifiedScopes,
    ...result.alreadyInStateScopes,
  ];

  if (totalAffectedScopes.length === 2) {
    const s1 = formatScopeItem(totalAffectedScopes[0]);
    const s2 = formatScopeItem(totalAffectedScopes[1]);

    if (isEnable) {
      return `Skill "${skillName}" ${actionVerb} ${preposition} ${s1} and ${s2} settings.`;
    } else {
      return `Skill "${skillName}" is now disabled in both ${s1} and ${s2} settings.`;
    }
  }

  const s = formatScopeItem(totalAffectedScopes[0]);
  return `Skill "${skillName}" ${actionVerb} ${preposition} ${s} settings.`;
}

/**
 * Central logic for installing a skill from a remote URL or local path.
 */
export async function installSkill(
  source: string,
  scope: 'user' | 'workspace',
  subpath: string | undefined,
  onLog: (msg: string) => void,
  requestConsent: (
    skills: SkillDefinition[],
    targetDir: string,
  ) => Promise<boolean> = () => Promise.resolve(true),
): Promise<Array<{ name: string; location: string }>> {
  let sourcePath = source;
  let tempDirToClean: string | undefined = undefined;

  const isGitUrl =
    source.startsWith('git@') ||
    source.startsWith('http://') ||
    source.startsWith('https://');

  const isSkillFile = source.toLowerCase().endsWith('.skill');

  try {
    if (isGitUrl) {
      tempDirToClean = await fs.mkdtemp(
        path.join(os.tmpdir(), 'gemini-skill-'),
      );
      sourcePath = tempDirToClean;

      onLog(`Cloning skill from ${source}...`);
      // Reuse existing robust git cloning utility from extension manager.
      await cloneFromGit(
        {
          source,
          type: 'git',
        },
        tempDirToClean,
      );
    } else if (isSkillFile) {
      tempDirToClean = await fs.mkdtemp(
        path.join(os.tmpdir(), 'gemini-skill-'),
      );
      sourcePath = tempDirToClean;

      onLog(`Extracting skill from ${source}...`);
      await extract(path.resolve(source), { dir: tempDirToClean });
    }

    // If a subpath is provided, resolve it against the cloned/local root.
    if (subpath) {
      sourcePath = path.join(sourcePath, subpath);
    }

    sourcePath = path.resolve(sourcePath);

    // Quick security check to prevent directory traversal out of temp dir when cloning
    if (
      tempDirToClean &&
      !sourcePath.startsWith(path.resolve(tempDirToClean))
    ) {
      throw new Error('Invalid path: Directory traversal not allowed.');
    }

    onLog(`Searching for skills in ${sourcePath}...`);
    const skills = await loadSkillsFromDir(sourcePath);

    if (skills.length === 0) {
      throw new Error(
        `No valid skills found in ${source}${subpath ? ` at path "${subpath}"` : ''}. Ensure a SKILL.md file exists with valid frontmatter.`,
      );
    }

    const workspaceDir = process.cwd();
    const storage = new Storage(workspaceDir);
    const targetDir =
      scope === 'workspace'
        ? storage.getProjectSkillsDir()
        : Storage.getUserSkillsDir();

    if (!(await requestConsent(skills, targetDir))) {
      throw new Error('Skill installation cancelled by user.');
    }

    await fs.mkdir(targetDir, { recursive: true });

    const installedSkills: Array<{ name: string; location: string }> = [];

    for (const skill of skills) {
      const skillName = skill.name;
      const skillDir = path.dirname(skill.location);
      const destPath = path.join(targetDir, skillName);

      const exists = await fs.stat(destPath).catch(() => null);
      if (exists) {
        onLog(`Skill "${skillName}" already exists. Overwriting...`);
        await fs.rm(destPath, { recursive: true, force: true });
      }

      await fs.cp(skillDir, destPath, { recursive: true });
      installedSkills.push({ name: skillName, location: destPath });
    }

    return installedSkills;
  } finally {
    if (tempDirToClean) {
      await fs.rm(tempDirToClean, { recursive: true, force: true });
    }
  }
}

/**
 * Central logic for uninstalling a skill by name.
 */
export async function uninstallSkill(
  name: string,
  scope: 'user' | 'workspace',
): Promise<{ location: string } | null> {
  const workspaceDir = process.cwd();
  const storage = new Storage(workspaceDir);
  const targetDir =
    scope === 'workspace'
      ? storage.getProjectSkillsDir()
      : Storage.getUserSkillsDir();

  const skillPath = path.join(targetDir, name);

  const exists = await fs.stat(skillPath).catch(() => null);

  if (!exists) {
    return null;
  }

  await fs.rm(skillPath, { recursive: true, force: true });
  return { location: skillPath };
}
