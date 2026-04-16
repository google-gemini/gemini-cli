/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import type { Config } from '../config/config.js';
import { Storage } from '../config/storage.js';
import type { ForumPreset } from './types.js';

const forumMemberSchema = z.object({
  memberId: z.string().min(1),
  agentName: z.string().min(1),
  label: z.string().min(1).optional(),
  role: z.enum(['discussant', 'synthesizer']).optional(),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  thinkingLevel: z.string().optional(),
  tools: z.array(z.string().min(1)).optional(),
  maxTimeMinutes: z.number().positive().optional(),
  maxTurns: z.number().int().positive().optional(),
  workspaceDirectories: z.array(z.string().min(1)).optional(),
});

const forumPresetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  maxRounds: z.number().int().positive().optional(),
  minDiscussionRounds: z.number().int().positive().optional(),
  members: z.array(forumMemberSchema).min(1),
});

function parseThinkingLevel(level?: string): ThinkingLevel | undefined {
  if (!level) {
    return undefined;
  }

  switch (level.trim().toUpperCase()) {
    case 'LOW':
      return ThinkingLevel.LOW;
    case 'HIGH':
      return ThinkingLevel.HIGH;
    default:
      return undefined;
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function mapDtoToPreset(
  dto: z.infer<typeof forumPresetSchema>,
  sourcePath: string,
  scope: 'user' | 'workspace',
): ForumPreset {
  return {
    name: dto.name,
    description: dto.description,
    maxRounds: dto.maxRounds,
    minDiscussionRounds: dto.minDiscussionRounds,
    members: dto.members.map((member) => {
      const thinkingLevel = parseThinkingLevel(member.thinkingLevel);
      return {
        memberId: member.memberId,
        agentName: member.agentName,
        label: member.label,
        role: member.role,
        systemPrompt: member.systemPrompt,
        modelConfig:
          member.model ||
          member.temperature !== undefined ||
          member.topP !== undefined ||
          member.topK !== undefined ||
          thinkingLevel !== undefined
            ? {
                ...(member.model !== undefined ? { model: member.model } : {}),
                generateContentConfig: {
                  temperature: member.temperature,
                  topP: member.topP,
                  topK: member.topK,
                  thinkingConfig:
                    thinkingLevel !== undefined
                      ? {
                          thinkingLevel,
                        }
                      : undefined,
                },
              }
            : undefined,
        toolConfig: member.tools ? { tools: member.tools } : undefined,
        runConfig:
          member.maxTimeMinutes !== undefined || member.maxTurns !== undefined
            ? {
                maxTimeMinutes: member.maxTimeMinutes,
                maxTurns: member.maxTurns,
              }
            : undefined,
        workspaceDirectories: member.workspaceDirectories,
      };
    }),
    source: {
      path: sourcePath,
      scope,
    },
  };
}

async function loadPresetsFromDirectory(
  directory: string,
  scope: 'user' | 'workspace',
): Promise<ForumPreset[]> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const presets: ForumPreset[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const filePath = path.join(directory, entry.name);
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = forumPresetSchema.parse(JSON.parse(raw) as unknown);
    presets.push(mapDtoToPreset(parsed, filePath, scope));
  }

  return presets;
}

export async function loadForumPresets(config: Config): Promise<ForumPreset[]> {
  const userPresets = await loadPresetsFromDirectory(
    Storage.getUserForumsDir(),
    'user',
  );
  const projectPresets = await loadPresetsFromDirectory(
    config.storage.getProjectForumsDir(),
    'workspace',
  );

  const merged = new Map<string, ForumPreset>();
  for (const preset of userPresets) {
    merged.set(preset.name, preset);
  }
  for (const preset of projectPresets) {
    merged.set(preset.name, preset);
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadForumPresetByName(
  config: Config,
  presetName: string,
): Promise<ForumPreset | undefined> {
  const presets = await loadForumPresets(config);
  return presets.find((preset) => preset.name === presetName);
}
