/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as Diff from 'diff';
import type { Config } from '../config/config.js';
import { Storage } from '../config/storage.js';
import { flattenMemory } from '../config/memory.js';
import { loadSkillFromFile, loadSkillsFromDir } from '../skills/skillLoader.js';
import {
  type AppliedSkillPatchTarget,
  applyParsedSkillPatches,
  hasParsedPatchHunks,
  isProjectSkillPatchTarget,
  validateParsedSkillPatchHeaders,
} from '../services/memoryPatchUtils.js';
import { readExtractionState } from '../services/memoryService.js';
import { refreshServerHierarchicalMemory } from '../utils/memoryDiscovery.js';
import type { MessageActionReturn, ToolActionReturn } from './types.js';

export function showMemory(config: Config): MessageActionReturn {
  const memoryContent = flattenMemory(config.getUserMemory());
  const fileCount = config.getGeminiMdFileCount() || 0;
  let content: string;

  if (memoryContent.length > 0) {
    content = `Current memory content from ${fileCount} file(s):\n\n---\n${memoryContent}\n---`;
  } else {
    content = 'Memory is currently empty.';
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

export function addMemory(
  args?: string,
): MessageActionReturn | ToolActionReturn {
  if (!args || args.trim() === '') {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /memory add <text to remember>',
    };
  }
  return {
    type: 'tool',
    toolName: 'save_memory',
    toolArgs: { fact: args.trim() },
  };
}

export async function refreshMemory(
  config: Config,
): Promise<MessageActionReturn> {
  let memoryContent = '';
  let fileCount = 0;

  if (config.isJitContextEnabled()) {
    await config.getMemoryContextManager()?.refresh();
    memoryContent = flattenMemory(config.getUserMemory());
    fileCount = config.getGeminiMdFileCount();
  } else {
    const result = await refreshServerHierarchicalMemory(config);
    memoryContent = flattenMemory(result.memoryContent);
    fileCount = result.fileCount;
  }

  config.updateSystemInstructionIfInitialized();
  let content: string;

  if (memoryContent.length > 0) {
    content = `Memory reloaded successfully. Loaded ${memoryContent.length} characters from ${fileCount} file(s)`;
  } else {
    content = 'Memory reloaded successfully. No memory content found';
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

export function listMemoryFiles(config: Config): MessageActionReturn {
  const filePaths = config.getGeminiMdFilePaths() || [];
  const fileCount = filePaths.length;
  let content: string;

  if (fileCount > 0) {
    content = `There are ${fileCount} GEMINI.md file(s) in use:\n\n${filePaths.join(
      '\n',
    )}`;
  } else {
    content = 'No GEMINI.md files in use.';
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

/**
 * Represents a skill found in the extraction inbox.
 */
export interface InboxSkill {
  /** Directory name in the inbox. */
  dirName: string;
  /** Skill name from SKILL.md frontmatter. */
  name: string;
  /** Skill description from SKILL.md frontmatter. */
  description: string;
  /** Raw SKILL.md content for preview. */
  content: string;
  /** When the skill was extracted (ISO string), if known. */
  extractedAt?: string;
}

/**
 * Scans the skill extraction inbox and returns structured data
 * for each extracted skill.
 */
export async function listInboxSkills(config: Config): Promise<InboxSkill[]> {
  const skillsDir = config.storage.getProjectSkillsMemoryDir();

  let entries: Array<import('node:fs').Dirent>;
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 0) {
    return [];
  }

  // Load extraction state to get dates
  const memoryDir = config.storage.getProjectMemoryTempDir();
  const statePath = path.join(memoryDir, '.extraction-state.json');
  const state = await readExtractionState(statePath);

  // Build a map: skillDirName → extractedAt
  const skillDateMap = new Map<string, string>();
  for (const run of state.runs) {
    for (const skillName of run.skillsCreated) {
      skillDateMap.set(skillName, run.runAt);
    }
  }

  const skills: InboxSkill[] = [];
  for (const dir of dirs) {
    const skillPath = path.join(skillsDir, dir.name, 'SKILL.md');
    const skillDef = await loadSkillFromFile(skillPath);
    if (!skillDef) continue;

    let content = '';
    try {
      content = await fs.readFile(skillPath, 'utf-8');
    } catch {
      // Best-effort — preview will be empty
    }

    skills.push({
      dirName: dir.name,
      name: skillDef.name,
      description: skillDef.description,
      content,
      extractedAt: skillDateMap.get(dir.name),
    });
  }

  return skills;
}

export type InboxSkillDestination = 'global' | 'project';

function isValidInboxSkillDirName(dirName: string): boolean {
  return (
    dirName.length > 0 &&
    dirName !== '.' &&
    dirName !== '..' &&
    !dirName.includes('/') &&
    !dirName.includes('\\')
  );
}

function isValidInboxPatchFileName(fileName: string): boolean {
  return (
    fileName.length > 0 &&
    fileName !== '.' &&
    fileName !== '..' &&
    !fileName.includes('/') &&
    !fileName.includes('\\')
  );
}

async function getSkillNameForConflictCheck(
  skillDir: string,
  fallbackName: string,
): Promise<string> {
  const skill = await loadSkillFromFile(path.join(skillDir, 'SKILL.md'));
  return skill?.name ?? fallbackName;
}

/**
 * Copies an inbox skill to the target skills directory.
 */
export async function moveInboxSkill(
  config: Config,
  dirName: string,
  destination: InboxSkillDestination,
): Promise<{ success: boolean; message: string }> {
  if (!isValidInboxSkillDirName(dirName)) {
    return {
      success: false,
      message: 'Invalid skill name.',
    };
  }

  const skillsDir = config.storage.getProjectSkillsMemoryDir();
  const sourcePath = path.join(skillsDir, dirName);

  try {
    await fs.access(sourcePath);
  } catch {
    return {
      success: false,
      message: `Skill "${dirName}" not found in inbox.`,
    };
  }

  const targetBase =
    destination === 'global'
      ? Storage.getUserSkillsDir()
      : config.storage.getProjectSkillsDir();
  const targetPath = path.join(targetBase, dirName);
  const skillName = await getSkillNameForConflictCheck(sourcePath, dirName);

  try {
    await fs.access(targetPath);
    return {
      success: false,
      message: `A skill named "${skillName}" already exists in ${destination} skills.`,
    };
  } catch {
    // Target doesn't exist — good
  }

  const existingTargetSkills = await loadSkillsFromDir(targetBase);
  if (existingTargetSkills.some((skill) => skill.name === skillName)) {
    return {
      success: false,
      message: `A skill named "${skillName}" already exists in ${destination} skills.`,
    };
  }

  await fs.mkdir(targetBase, { recursive: true });
  await fs.cp(sourcePath, targetPath, { recursive: true });

  // Remove from inbox after successful copy
  await fs.rm(sourcePath, { recursive: true, force: true });

  const label =
    destination === 'global' ? '~/.gemini/skills' : '.gemini/skills';
  return {
    success: true,
    message: `Moved "${dirName}" to ${label}.`,
  };
}

/**
 * Removes a skill from the extraction inbox.
 */
export async function dismissInboxSkill(
  config: Config,
  dirName: string,
): Promise<{ success: boolean; message: string }> {
  if (!isValidInboxSkillDirName(dirName)) {
    return {
      success: false,
      message: 'Invalid skill name.',
    };
  }

  const skillsDir = config.storage.getProjectSkillsMemoryDir();
  const sourcePath = path.join(skillsDir, dirName);

  try {
    await fs.access(sourcePath);
  } catch {
    return {
      success: false,
      message: `Skill "${dirName}" not found in inbox.`,
    };
  }

  await fs.rm(sourcePath, { recursive: true, force: true });

  return {
    success: true,
    message: `Dismissed "${dirName}" from inbox.`,
  };
}

/**
 * A parsed patch entry from a unified diff, representing changes to a single file.
 */
export interface InboxPatchEntry {
  /** Absolute path to the target file (or '/dev/null' for new files). */
  targetPath: string;
  /** The unified diff text for this single file. */
  diffContent: string;
}

/**
 * Represents a .patch file found in the extraction inbox.
 */
export interface InboxPatch {
  /** The .patch filename (e.g. "update-docs-writer.patch"). */
  fileName: string;
  /** Display name (filename without .patch extension). */
  name: string;
  /** Per-file entries parsed from the patch. */
  entries: InboxPatchEntry[];
  /** When the patch was extracted (ISO string), if known. */
  extractedAt?: string;
}

interface StagedInboxPatchTarget {
  targetPath: string;
  tempPath: string;
  original: string;
  isNewFile: boolean;
  mode?: number;
}

/**
 * Reconstructs a unified diff string for a single ParsedDiff entry.
 */
function formatParsedDiff(parsed: Diff.StructuredPatch): string {
  const lines: string[] = [];
  if (parsed.oldFileName) {
    lines.push(`--- ${parsed.oldFileName}`);
  }
  if (parsed.newFileName) {
    lines.push(`+++ ${parsed.newFileName}`);
  }
  for (const hunk of parsed.hunks) {
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    );
    for (const line of hunk.lines) {
      lines.push(line);
    }
  }
  return lines.join('\n');
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function patchTargetsProjectSkills(
  targetPaths: string[],
  config: Config,
) {
  for (const targetPath of targetPaths) {
    if (await isProjectSkillPatchTarget(targetPath, config)) {
      return true;
    }
  }
  return false;
}

async function getPatchExtractedAt(
  patchPath: string,
): Promise<string | undefined> {
  try {
    const stats = await fs.stat(patchPath);
    return stats.mtime.toISOString();
  } catch {
    return undefined;
  }
}

async function findNearestExistingDirectory(
  startPath: string,
): Promise<string> {
  let currentPath = path.resolve(startPath);

  while (true) {
    try {
      const stats = await fs.stat(currentPath);
      if (stats.isDirectory()) {
        return currentPath;
      }
    } catch {
      // Keep walking upward until we find an existing directory.
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return currentPath;
    }
    currentPath = parentPath;
  }
}

async function writeExclusiveFile(
  filePath: string,
  content: string,
  mode?: number,
): Promise<void> {
  const handle = await fs.open(filePath, 'wx');
  try {
    await handle.writeFile(content, 'utf-8');
  } finally {
    await handle.close();
  }

  if (mode !== undefined) {
    await fs.chmod(filePath, mode);
  }
}

async function cleanupStagedInboxPatchTargets(
  stagedTargets: StagedInboxPatchTarget[],
): Promise<void> {
  await Promise.allSettled(
    stagedTargets.map(async ({ tempPath }) => {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Best-effort cleanup.
      }
    }),
  );
}

async function restoreCommittedInboxPatchTarget(
  stagedTarget: StagedInboxPatchTarget,
): Promise<void> {
  if (stagedTarget.isNewFile) {
    try {
      await fs.unlink(stagedTarget.targetPath);
    } catch {
      // Best-effort rollback.
    }
    return;
  }

  const restoreDir = await findNearestExistingDirectory(
    path.dirname(stagedTarget.targetPath),
  );
  const restorePath = path.join(
    restoreDir,
    `.${path.basename(stagedTarget.targetPath)}.${randomUUID()}.rollback`,
  );

  await writeExclusiveFile(
    restorePath,
    stagedTarget.original,
    stagedTarget.mode,
  );
  await fs.rename(restorePath, stagedTarget.targetPath);
}

async function stageInboxPatchTargets(
  targets: AppliedSkillPatchTarget[],
): Promise<StagedInboxPatchTarget[]> {
  const stagedTargets: StagedInboxPatchTarget[] = [];

  try {
    for (const target of targets) {
      let mode: number | undefined;
      if (!target.isNewFile) {
        await fs.access(target.targetPath, fsConstants.W_OK);
        mode = (await fs.stat(target.targetPath)).mode;
      }

      const tempDir = await findNearestExistingDirectory(
        path.dirname(target.targetPath),
      );
      const tempPath = path.join(
        tempDir,
        `.${path.basename(target.targetPath)}.${randomUUID()}.patch-tmp`,
      );

      await writeExclusiveFile(tempPath, target.patched, mode);
      stagedTargets.push({
        targetPath: target.targetPath,
        tempPath,
        original: target.original,
        isNewFile: target.isNewFile,
        mode,
      });
    }

    for (const target of stagedTargets) {
      if (!target.isNewFile) {
        continue;
      }
      await fs.mkdir(path.dirname(target.targetPath), { recursive: true });
    }

    return stagedTargets;
  } catch (error) {
    await cleanupStagedInboxPatchTargets(stagedTargets);
    throw error;
  }
}

/**
 * Scans the skill extraction inbox for .patch files and returns
 * structured data for each valid patch.
 */
export async function listInboxPatches(config: Config): Promise<InboxPatch[]> {
  const skillsDir = config.storage.getProjectSkillsMemoryDir();

  let entries: string[];
  try {
    entries = await fs.readdir(skillsDir);
  } catch {
    return [];
  }

  const patchFiles = entries.filter((e) => e.endsWith('.patch'));
  if (patchFiles.length === 0) {
    return [];
  }

  const patches: InboxPatch[] = [];
  for (const patchFile of patchFiles) {
    const patchPath = path.join(skillsDir, patchFile);
    try {
      const content = await fs.readFile(patchPath, 'utf-8');
      const parsed = Diff.parsePatch(content);
      if (!hasParsedPatchHunks(parsed)) continue;

      const patchEntries: InboxPatchEntry[] = parsed.map((p) => ({
        targetPath: p.newFileName ?? p.oldFileName ?? '',
        diffContent: formatParsedDiff(p),
      }));

      patches.push({
        fileName: patchFile,
        name: patchFile.replace(/\.patch$/, ''),
        entries: patchEntries,
        extractedAt: await getPatchExtractedAt(patchPath),
      });
    } catch {
      // Skip unreadable patch files
    }
  }

  return patches;
}

/**
 * Applies a .patch file from the inbox by reading each target file,
 * applying the diff, and writing the result. Deletes the patch on success.
 */
export async function applyInboxPatch(
  config: Config,
  fileName: string,
): Promise<{ success: boolean; message: string }> {
  if (!isValidInboxPatchFileName(fileName)) {
    return {
      success: false,
      message: 'Invalid patch file name.',
    };
  }

  const skillsDir = config.storage.getProjectSkillsMemoryDir();
  const patchPath = path.join(skillsDir, fileName);

  let content: string;
  try {
    content = await fs.readFile(patchPath, 'utf-8');
  } catch {
    return {
      success: false,
      message: `Patch "${fileName}" not found in inbox.`,
    };
  }

  let parsed: Diff.StructuredPatch[];
  try {
    parsed = Diff.parsePatch(content);
  } catch (error) {
    return {
      success: false,
      message: `Failed to parse patch "${fileName}": ${getErrorMessage(error)}`,
    };
  }
  if (!hasParsedPatchHunks(parsed)) {
    return {
      success: false,
      message: `Patch "${fileName}" contains no valid hunks.`,
    };
  }

  const validatedHeaders = validateParsedSkillPatchHeaders(parsed);
  if (!validatedHeaders.success) {
    return {
      success: false,
      message:
        validatedHeaders.reason === 'missingTargetPath'
          ? `Patch "${fileName}" is missing a target file path.`
          : `Patch "${fileName}" has invalid diff headers.`,
    };
  }

  if (
    !config.isTrustedFolder() &&
    (await patchTargetsProjectSkills(
      validatedHeaders.patches.map((patch) => patch.targetPath),
      config,
    ))
  ) {
    return {
      success: false,
      message:
        'Project skill patches are unavailable until this workspace is trusted.',
    };
  }

  // Dry-run first: verify all patches apply cleanly before writing anything.
  // Repeated file blocks are validated against the progressively patched content.
  const applied = await applyParsedSkillPatches(parsed, config);
  if (!applied.success) {
    switch (applied.reason) {
      case 'missingTargetPath':
        return {
          success: false,
          message: `Patch "${fileName}" is missing a target file path.`,
        };
      case 'invalidPatchHeaders':
        return {
          success: false,
          message: `Patch "${fileName}" has invalid diff headers.`,
        };
      case 'outsideAllowedRoots':
        return {
          success: false,
          message: `Patch "${fileName}" targets a file outside the global/workspace skill directories: ${applied.targetPath}`,
        };
      case 'newFileAlreadyExists':
        return {
          success: false,
          message: `Patch "${fileName}" declares a new file, but the target already exists: ${applied.targetPath}`,
        };
      case 'targetNotFound':
        return {
          success: false,
          message: `Target file not found: ${applied.targetPath}`,
        };
      case 'doesNotApply':
        return {
          success: false,
          message: applied.isNewFile
            ? `Patch "${fileName}" failed to apply for new file ${applied.targetPath}.`
            : `Patch does not apply cleanly to ${applied.targetPath}.`,
        };
      default:
        return {
          success: false,
          message: `Patch "${fileName}" could not be applied.`,
        };
    }
  }

  let stagedTargets: StagedInboxPatchTarget[];
  try {
    stagedTargets = await stageInboxPatchTargets(applied.results);
  } catch (error) {
    return {
      success: false,
      message: `Patch "${fileName}" could not be staged: ${getErrorMessage(error)}.`,
    };
  }

  const committedTargets: StagedInboxPatchTarget[] = [];
  try {
    for (const stagedTarget of stagedTargets) {
      await fs.rename(stagedTarget.tempPath, stagedTarget.targetPath);
      committedTargets.push(stagedTarget);
    }
  } catch (error) {
    for (const committedTarget of committedTargets.reverse()) {
      try {
        await restoreCommittedInboxPatchTarget(committedTarget);
      } catch {
        // Best-effort rollback. We still report the commit failure below.
      }
    }
    await cleanupStagedInboxPatchTargets(
      stagedTargets.filter((target) => !committedTargets.includes(target)),
    );
    return {
      success: false,
      message: `Patch "${fileName}" could not be applied atomically: ${getErrorMessage(error)}.`,
    };
  }

  // Remove the patch file
  await fs.unlink(patchPath);

  const fileCount = applied.results.length;
  return {
    success: true,
    message: `Applied patch to ${fileCount} file${fileCount !== 1 ? 's' : ''}.`,
  };
}

/**
 * Removes a .patch file from the extraction inbox.
 */
export async function dismissInboxPatch(
  config: Config,
  fileName: string,
): Promise<{ success: boolean; message: string }> {
  if (!isValidInboxPatchFileName(fileName)) {
    return {
      success: false,
      message: 'Invalid patch file name.',
    };
  }

  const skillsDir = config.storage.getProjectSkillsMemoryDir();
  const patchPath = path.join(skillsDir, fileName);

  try {
    await fs.access(patchPath);
  } catch {
    return {
      success: false,
      message: `Patch "${fileName}" not found in inbox.`,
    };
  }

  await fs.unlink(patchPath);

  return {
    success: true,
    message: `Dismissed "${fileName}" from inbox.`,
  };
}
