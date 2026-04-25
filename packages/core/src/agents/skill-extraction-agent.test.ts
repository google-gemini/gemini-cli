/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { SkillExtractionAgent } from './skill-extraction-agent.js';
import {
  EDIT_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from '../tools/tool-names.js';
import { PREVIEW_GEMINI_FLASH_MODEL } from '../config/models.js';

describe('SkillExtractionAgent', () => {
  const skillsDir = '/tmp/skills';
  const sessionIndex =
    '[NEW] Debug login flow (12 user msgs) — /tmp/chats/session-1.json';
  const existingSkillsSummary =
    '## Workspace Skills (.gemini/skills — do NOT duplicate)\n- **existing-skill**: Existing description';

  const agent = SkillExtractionAgent(
    skillsDir,
    sessionIndex,
    existingSkillsSummary,
  );

  it('should expose expected metadata, model, and tools', () => {
    expect(agent.kind).toBe('local');
    expect(agent.name).toBe('confucius');
    expect(agent.displayName).toBe('Skill Extractor');
    expect(agent.modelConfig.model).toBe(PREVIEW_GEMINI_FLASH_MODEL);
    expect(agent.toolConfig?.tools).toEqual(
      expect.arrayContaining([
        READ_FILE_TOOL_NAME,
        WRITE_FILE_TOOL_NAME,
        EDIT_TOOL_NAME,
        LS_TOOL_NAME,
        GLOB_TOOL_NAME,
        GREP_TOOL_NAME,
      ]),
    );
  });

  it('should default to no skill unless recurrence and durability are proven', () => {
    const prompt = agent.promptConfig.systemPrompt;

    expect(prompt).toContain('Default to NO SKILL.');
    expect(prompt).toContain(
      'strong evidence this will recur for future agents in this repo/workflow',
    );
    expect(prompt).toContain('broader than a single incident');
    expect(prompt).toContain('A skill MUST meet ALL of these criteria:');
    expect(prompt).toContain(
      'Future agents in this repo/workflow are likely to need it',
    );
  });

  it('should explicitly reject one-off incidents and single-session preferences', () => {
    const prompt = agent.promptConfig.systemPrompt;

    expect(prompt).toContain('Single-session preferences');
    expect(prompt).toContain('One-off incidents');
    expect(prompt).toContain('Output-style preferences');
    expect(prompt).toContain('cannot survive renaming the specific');
  });

  it('should warn that session summaries are user-intent summaries, not workflow evidence', () => {
    const query = agent.promptConfig.query ?? '';

    expect(query).toContain(existingSkillsSummary);
    expect(query).toContain(sessionIndex);
    expect(query).toContain('optional workflow hint');
    expect(query).toContain(
      'workflow hints alone is never enough evidence for a reusable skill.',
    );
    expect(query).toContain(
      'Session summaries describe user intent; optional workflow hints describe likely procedural traces.',
    );
    expect(query).toContain('Use workflow hints for routing');
    expect(query).toContain(
      'Only write a skill if the evidence shows a durable, recurring workflow',
    );
    expect(query).toContain(
      'If recurrence or future reuse is unclear, create no skill and explain why.',
    );
  });
});
