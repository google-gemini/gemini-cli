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
import { glob } from 'glob';
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
 * Central logic for linking a skill from a local path via symlink.
 */
export async function linkSkill(
  source: string,
  scope: 'user' | 'workspace',
  onLog: (msg: string) => void,
  requestConsent: (
    skills: SkillDefinition[],
    targetDir: string,
  ) => Promise<boolean> = () => Promise.resolve(true),
): Promise<Array<{ name: string; location: string }>> {
  const sourcePath = path.resolve(source);

  onLog(`Searching for skills in ${sourcePath}...`);
  const skills = await loadSkillsFromDir(sourcePath);

  if (skills.length === 0) {
    throw new Error(
      `No valid skills found in "${sourcePath}". Ensure a SKILL.md file exists with valid frontmatter.`,
    );
  }

  // Check for internal name collisions
  const seenNames = new Map<string, string>();
  for (const skill of skills) {
    if (seenNames.has(skill.name)) {
      throw new Error(
        `Duplicate skill name "${skill.name}" found at multiple locations:\n  - ${seenNames.get(skill.name)}\n  - ${skill.location}`,
      );
    }
    seenNames.set(skill.name, skill.location);
  }

  const workspaceDir = process.cwd();
  const storage = new Storage(workspaceDir);
  const targetDir =
    scope === 'workspace'
      ? storage.getProjectSkillsDir()
      : Storage.getUserSkillsDir();

  if (!(await requestConsent(skills, targetDir))) {
    throw new Error('Skill linking cancelled by user.');
  }

  await fs.mkdir(targetDir, { recursive: true });

  const linkedSkills: Array<{ name: string; location: string }> = [];

  for (const skill of skills) {
    const skillName = skill.name;
    const skillSourceDir = path.dirname(skill.location);
    const destPath = path.join(targetDir, skillName);

    const exists = await fs.lstat(destPath).catch(() => null);
    if (exists) {
      onLog(
        `Skill "${skillName}" already exists at destination. Overwriting...`,
      );
      await fs.rm(destPath, { recursive: true, force: true });
    }

    await fs.symlink(skillSourceDir, destPath, 'dir');
    linkedSkills.push({ name: skillName, location: destPath });
  }

  return linkedSkills;
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

/**
 * Central logic for syncing skills from external tools (Claude, OpenCode).
 */
export async function syncSkills(onLog: (msg: string) => void): Promise<{
  synced: string[];
  cleaned: string[];
  conflicts: string[];
}> {
  const home = os.homedir();

  // 1. Identify all native skill names by scanning content in parallel
  const nativePaths = [
    Storage.getUserSkillsDir(), // User Tier Standard
    path.join(home, '.agents', 'skills'), // User Tier Alias
    path.join(Storage.getGlobalGeminiDir(), 'extensions'), // Extension Tier root
  ];

  const existingNativeSkillNames = new Set<string>();

  const scanNativePath = async (p: string) => {
    const stats = await fs.stat(p).catch(() => null);
    if (!stats?.isDirectory()) return;

    if (p === Storage.getUserSkillsDir()) {
      const entries = await fs.readdir(p, { withFileTypes: true });
      await Promise.all(
        entries.map(async (entry) => {
          if (entry.isDirectory() && !entry.isSymbolicLink()) {
            const skills = await loadSkillsFromDir(path.join(p, entry.name));
            for (const s of skills) existingNativeSkillNames.add(s.name);
          }
        }),
      );
    } else if (p.includes('extensions')) {
      const matches = await glob(path.join(p, '**', 'skills'), {
        nodir: false,
      });
      await Promise.all(
        matches.map(async (match) => {
          const skills = await loadSkillsFromDir(match);
          for (const s of skills) existingNativeSkillNames.add(s.name);
        }),
      );
    } else {
      const skills = await loadSkillsFromDir(p);
      for (const s of skills) existingNativeSkillNames.add(s.name);
    }
  };

  await Promise.all(nativePaths.map(scanNativePath));

  // 2. Define source paths for syncing
  const sourcePaths = [
    path.join(home, '.claude', 'skills'),
    path.join(home, '.config', 'opencode', 'skills'),
  ];

  const targetDir = Storage.getUserSkillsDir();
  await fs.mkdir(targetDir, { recursive: true });

  const synced: string[] = [];
  const cleaned: string[] = [];
  const conflicts: string[] = [];

  // 3. Cleanup pass: Standardize and deduplicate links in parallel
  const targetEntries = await fs.readdir(targetDir, { withFileTypes: true });
  const sourceToLinkMap = new Map<string, string>();

  const resolveTarget = async (linkPath: string) => {
    const raw = await fs.readlink(linkPath).catch(() => null);
    if (!raw) return null;
    return path
      .resolve(
        path.isAbsolute(raw) ? raw : path.join(path.dirname(linkPath), raw),
      )
      .replace(/\/+$/, '');
  };

  // First pass: Map sources to official names
  await Promise.all(
    targetEntries.map(async (entry) => {
      if (!entry.isSymbolicLink()) return;
      const entryPath = path.join(targetDir, entry.name);
      const resolvedPath = await resolveTarget(entryPath);
      if (!resolvedPath) return;

      const linkedSkills = await loadSkillsFromDir(entryPath);
      const actualSkillName = linkedSkills[0]?.name;
      if (actualSkillName && entry.name === actualSkillName) {
        sourceToLinkMap.set(resolvedPath, entry.name);
      }
    }),
  );

  // Second pass: Clean up
  await Promise.all(
    targetEntries.map(async (entry) => {
      if (!entry.isSymbolicLink()) return;
      const entryPath = path.join(targetDir, entry.name);
      const targetExists = await fs.stat(entryPath).catch(() => null);

      if (!targetExists) {
        onLog(`Removing broken link: ${entry.name}`);
        await fs.rm(entryPath);
        cleaned.push(entry.name);
        return;
      }

      const resolvedTargetPath = await resolveTarget(entryPath);
      if (!resolvedTargetPath) return;

      const linkedSkills = await loadSkillsFromDir(entryPath);
      const linkedSkillName = linkedSkills[0]?.name || entry.name;

      if (existingNativeSkillNames.has(linkedSkillName)) {
        onLog(
          `Removing conflicting link: ${entry.name} (conflicts with native ${linkedSkillName})`,
        );
        await fs.rm(entryPath);
        cleaned.push(entry.name);
      } else {
        const officialLinkName = sourceToLinkMap.get(resolvedTargetPath);
        if (officialLinkName && entry.name !== officialLinkName) {
          onLog(
            `Removing redundant link: ${entry.name} (official name is ${officialLinkName})`,
          );
          await fs.rm(entryPath);
          cleaned.push(entry.name);
        }
      }
    }),
  );

  // 4. Linking pass
  for (const sourcePath of sourcePaths) {
    const stats = await fs.stat(sourcePath).catch(() => null);
    if (!stats?.isDirectory()) continue;

    const externalSkills = await loadSkillsFromDir(sourcePath);
    if (externalSkills.length === 0) continue;

    onLog(`Syncing skills from ${sourcePath}...`);
    for (const skill of externalSkills) {
      const skillName = skill.name;
      const skillSourceDir = path.dirname(skill.location);
      const destPath = path.join(targetDir, skillName);

      if (existingNativeSkillNames.has(skillName)) {
        conflicts.push(skillName);
        continue;
      }

      const destExists = await fs.lstat(destPath).catch(() => null);
      if (destExists) {
        if (destExists.isSymbolicLink()) {
          const currentTarget = await resolveTarget(destPath);
          if (currentTarget === skillSourceDir.replace(/\/+$/, '')) {
            continue; // Already synced correctly
          }
          await fs.rm(destPath);
        } else {
          conflicts.push(skillName);
          continue;
        }
      }

      onLog(`Linking skill: ${skillName}`);
      await fs.symlink(skillSourceDir, destPath, 'dir');
      synced.push(skillName);
    }
  }

  return { synced, cleaned, conflicts };
}
