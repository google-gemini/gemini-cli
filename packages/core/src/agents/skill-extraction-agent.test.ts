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
  SHELL_TOOL_NAME,
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
    expect(agent.memoryInboxAccess).toBe(true);
    expect(agent.autoMemoryExtractionWriteAccess).toBe(true);
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
    expect(agent.toolConfig?.tools).not.toContain(SHELL_TOOL_NAME);
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

  it('should require all memory updates to go through .inbox/<kind>/*.patch for review', () => {
    const prompt = SkillExtractionAgent(
      skillsDir,
      sessionIndex,
      existingSkillsSummary,
      '/tmp/memory',
    ).promptConfig.systemPrompt;

    expect(prompt).toContain(
      'ALL memory updates are expressed as unified diff `.patch` files',
    );
    expect(prompt).toContain('EXACTLY ONE canonical patch file per kind');
    expect(prompt).toContain('extraction.patch');
    expect(prompt).not.toContain('MEMORY.patch');
    expect(prompt).not.toContain('verify-workflow.patch');
    expect(prompt).toContain('IMPORTANT — incremental updates');
    expect(prompt).toContain(
      'REWRITE that file by combining its existing hunks with your new',
    );
    expect(prompt).toContain('private  ->');
    expect(prompt).toContain('global   ->');
    expect(prompt).toContain(
      'the target MUST be exactly the single global personal memory',
    );
    expect(prompt).toContain('~/.gemini/GEMINI.md');
    expect(prompt).not.toContain('memory.md');
    expect(prompt).not.toContain('and siblings');
    expect(prompt).toContain(
      'Project/workspace shared instructions (GEMINI.md and similar files',
    );
    expect(prompt).toContain('MEMORY PATCH FORMAT (STRICT)');
    expect(prompt).toContain('--- /dev/null');
    expect(prompt).toContain('NEVER directly edit MEMORY.md');
    expect(prompt).toContain(
      'Every patch you write is held for /memory inbox review.',
    );
    expect(prompt).toContain('the user must approve each patch');

    // The MEMORY.md-as-index discipline: sibling creations should pair with
    // a MEMORY.md update hunk; the inbox apply step auto-bundles a generic
    // pointer if the agent forgets, but the agent should write its own.
    expect(prompt).toContain('PRIVATE MEMORY: MEMORY.md IS THE INDEX');
    expect(prompt).toContain(
      'when you create a new sibling .md file, your patch SHOULD',
    );
    expect(prompt).toContain('a SECOND HUNK that updates MEMORY.md');
    expect(prompt).toContain('inbox apply step');
    expect(prompt).toContain('auto-bundle a generic pointer');

    // Pointer paths must be ABSOLUTE — the runtime agent reads them directly.
    expect(prompt).toContain('IMPORTANT — pointer paths must be ABSOLUTE');
    expect(prompt).toContain('Always write the full path');
    // The example pointer in the prompt also uses the absolute path.
    expect(prompt).toContain(`+- See /tmp/memory/<topic>.md for`);
  });

  it('surfaces existing inbox patches in the initial query when present', () => {
    const pendingInbox = [
      '## private (1)',
      '',
      '### extraction.patch',
      '```',
      '--- /dev/null',
      '+++ /tmp/memory/MEMORY.md',
      '@@ -0,0 +1,1 @@',
      '+- previously-extracted fact',
      '```',
    ].join('\n');

    const agentWithInbox = SkillExtractionAgent(
      skillsDir,
      sessionIndex,
      existingSkillsSummary,
      '/tmp/memory',
      pendingInbox,
    );
    const query = agentWithInbox.promptConfig.query ?? '';

    expect(query).toContain('# Pending Memory Inbox');
    expect(query).toContain('extraction.patch');
    expect(query).toContain('previously-extracted fact');
    expect(query).toContain(
      'REWRITE that patch (overwrite the same path) with',
    );
  });

  it('omits the pending inbox section when nothing is pending', () => {
    const agentEmpty = SkillExtractionAgent(
      skillsDir,
      sessionIndex,
      existingSkillsSummary,
      '/tmp/memory',
      '',
    );
    const query = agentEmpty.promptConfig.query ?? '';
    expect(query).not.toContain('# Pending Memory Inbox');
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
      'Only write memory if it would clearly help a future session.',
    );
    expect(query).toContain(
      'If recurrence, durability, or future reuse is unclear, create no artifact and explain why.',
    );
  });
});
