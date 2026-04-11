/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Config } from '../config/config.js';
import { Storage } from '../config/storage.js';
import { flattenMemory } from '../config/memory.js';
import { loadSkillFromFile, loadSkillsFromDir } from '../skills/skillLoader.js';
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

    skills.push({
      dirName: dir.name,
      name: skillDef.name,
      description: skillDef.description,
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
