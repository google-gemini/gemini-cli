/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { homedir, GEMINI_DIR } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  type MemoryFile,
  type MemoryType,
  type MemoryLoadResult,
  parseMemoryType,
  MEMORY_TYPES,
} from './types.js';

const MEMORY_DIR_NAME = 'memory';
const ENTRYPOINT_NAME = 'MEMORY.md';
const MAX_ENTRYPOINT_LINES = 200;
const MAX_ENTRYPOINT_BYTES = 25_000;

const logger = {
  debug: (...args: unknown[]) =>
    debugLogger.debug('[DEBUG] [MemoryDiscovery]', ...args),
  warn: (...args: unknown[]) =>
    debugLogger.warn('[WARN] [MemoryDiscovery]', ...args),
  error: (...args: unknown[]) =>
    debugLogger.error('[ERROR] [MemoryDiscovery]', ...args),
};

/**
 * Get the path to the memory directory for the current project.
 * This is `~/.gemini/projects/<project-slug>/memory/`
 */
export function getMemoryDir(projectRoot: string): string {
  const projectSlug = projectRoot
    .replace(/[/\\:]/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 50);
  return path.join(homedir(), GEMINI_DIR, 'projects', projectSlug, MEMORY_DIR_NAME);
}

/**
 * Get the path to the MEMORY.md entrypoint file.
 */
export function getMemoryEntrypoint(memoryDir: string): string {
  return path.join(memoryDir, ENTRYPOINT_NAME);
}

/**
 * Ensure the memory directory exists.
 */
export async function ensureMemoryDirExists(memoryDir: string): Promise<void> {
  try {
    await fs.mkdir(memoryDir, { recursive: true });
    logger.debug('Created memory directory:', memoryDir);
  } catch (e: unknown) {
    const code =
      e instanceof Error && 'code' in e && typeof e.code === 'string'
        ? e.code
        : undefined;
    logger.error(`ensureMemoryDirExists failed for ${memoryDir}: ${code ?? String(e)}`);
  }
}

/**
 * Parse frontmatter from memory file content.
 * Supports YAML-style frontmatter with name, description, and type fields.
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  content: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, content: content.trim() };
  }

  const frontmatterRaw = match[1];
  const body = match[2];

  const frontmatter: Record<string, string> = {};
  const lines = frontmatterRaw.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }

  return { frontmatter, content: body.trim() };
}

/**
 * Create default frontmatter for a new memory file.
 */
export function createFrontmatter(
  name: string,
  description: string,
  type: MemoryType,
): string {
  return `---
name: ${name}
description: ${description}
type: ${type}
---

`;
}

/**
 * Create the default MEMORY.md index template.
 */
export function createDefaultMemoryIndex(): string {
  return `# Memory Index

This file is an index of all stored memories. Each entry should be one line under ~150 characters.

## Active Memories

<!-- Memory entries will be added here automatically -->

## Memory Types

- **user**: Information about the user's role, preferences, and knowledge
- **feedback**: Guidance about how to approach work (what to avoid/keep doing)
- **project**: Context about ongoing work, goals, or incidents
- **reference**: Pointers to external systems and resources
`;
}

/**
 * Truncate MEMORY.md content to the line AND byte caps.
 */
export function truncateEntrypointContent(raw: string): {
  content: string;
  lineCount: number;
  byteCount: number;
  wasLineTruncated: boolean;
  wasByteTruncated: boolean;
} {
  const trimmed = raw.trim();
  const contentLines = trimmed.split('\n');
  const lineCount = contentLines.length;
  const byteCount = trimmed.length;

  const wasLineTruncated = lineCount > MAX_ENTRYPOINT_LINES;
  const wasByteTruncated = byteCount > MAX_ENTRYPOINT_BYTES;

  if (!wasLineTruncated && !wasByteTruncated) {
    return {
      content: trimmed,
      lineCount,
      byteCount,
      wasLineTruncated,
      wasByteTruncated,
    };
  }

  let truncated = wasLineTruncated
    ? contentLines.slice(0, MAX_ENTRYPOINT_LINES).join('\n')
    : trimmed;

  if (truncated.length > MAX_ENTRYPOINT_BYTES) {
    const cutAt = truncated.lastIndexOf('\n', MAX_ENTRYPOINT_BYTES);
    truncated = truncated.slice(0, cutAt > 0 ? cutAt : MAX_ENTRYPOINT_BYTES);
  }

  const reason =
    wasByteTruncated && !wasLineTruncated
      ? `${byteCount} bytes (limit: ${MAX_ENTRYPOINT_BYTES})`
      : wasLineTruncated && !wasByteTruncated
        ? `${lineCount} lines (limit: ${MAX_ENTRYPOINT_LINES})`
        : `${lineCount} lines and ${byteCount} bytes`;

  return {
    content:
      truncated +
      `\n\n> WARNING: ${ENTRYPOINT_NAME} is ${reason}. Only part of it was loaded.`,
    lineCount,
    byteCount,
    wasLineTruncated,
    wasByteTruncated,
  };
}

/**
 * Read and parse a memory file.
 */
export async function readMemoryFile(filePath: string): Promise<MemoryFile | null> {
  try {
    const rawContent = await fs.readFile(filePath, 'utf-8');
    const { frontmatter, content } = parseFrontmatter(rawContent);

    const name = frontmatter['name'] || path.basename(filePath, '.md');
    const description = frontmatter['description'] || '';
    const type = parseMemoryType(frontmatter['type']) || 'project';

    return {
      path: filePath,
      name,
      description,
      type,
      content,
      rawContent,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn(`Failed to read memory file ${filePath}: ${message}`);
    return null;
  }
}

/**
 * Scan all memory files in the memory directory.
 */
export async function scanMemoryFiles(memoryDir: string): Promise<MemoryFile[]> {
  const files: MemoryFile[] = [];

  try {
    const entries = await fs.readdir(memoryDir, { withFileTypes: true });
    const mdFiles = entries.filter(
      (e) => e.isFile() && e.name.endsWith('.md') && e.name !== ENTRYPOINT_NAME,
    );

    // Process in parallel with concurrency limit
    const CONCURRENT_LIMIT = 20;
    for (let i = 0; i < mdFiles.length; i += CONCURRENT_LIMIT) {
      const batch = mdFiles.slice(i, i + CONCURRENT_LIMIT);
      const batchResults = await Promise.all(
        batch.map((entry) => readMemoryFile(path.join(memoryDir, entry.name))),
      );
      files.push(...(batchResults.filter((f): f is MemoryFile => f !== null)));
    }
  } catch (e: unknown) {
    const code =
      e instanceof Error && 'code' in e && typeof (e as NodeJS.ErrnoException).code === 'string'
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code !== 'ENOENT') {
      logger.error(`Failed to scan memory directory ${memoryDir}: ${code ?? String(e)}`);
    }
  }

  return files;
}

/**
 * Load the memory directory and all files.
 * Creates the directory and default MEMORY.md if they don't exist.
 */
export async function loadMemoryDirectory(projectRoot: string): Promise<MemoryLoadResult> {
  const memoryDir = getMemoryDir(projectRoot);
  const entrypointPath = getMemoryEntrypoint(memoryDir);

  let isNew = false;

  // Check if directory exists
  try {
    await fs.access(memoryDir, fsSync.constants.R_OK);
  } catch {
    // Directory doesn't exist, create it and the template
    await ensureMemoryDirExists(memoryDir);
    isNew = true;
  }

  // Check for MEMORY.md
  let indexContent: string | null = null;
  try {
    const rawContent = await fs.readFile(entrypointPath, 'utf-8');
    const truncated = truncateEntrypointContent(rawContent);
    indexContent = truncated.content;
  } catch {
    // MEMORY.md doesn't exist yet, create template
    if (isNew) {
      try {
        await fs.writeFile(entrypointPath, createDefaultMemoryIndex(), 'utf-8');
        indexContent = createDefaultMemoryIndex();
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger.error(`Failed to create MEMORY.md template: ${message}`);
      }
    }
  }

  // Scan for all memory files
  const files = await scanMemoryFiles(memoryDir);

  return {
    memoryDir,
    indexContent,
    files,
    isNew: isNew && files.length === 0,
  };
}

/**
 * Build the memory prompt for injection into system context.
 */
export function buildMemoryPrompt(
  memoryDir: string,
  files: MemoryFile[],
  indexContent: string | null,
): string {
  const lines: string[] = [
    '# auto memory',
    '',
    `You have a persistent, file-based memory system at \`${memoryDir}\`. This directory already exists — write to it directly with the Write tool (do not run mkdir or check for its existence).`,
    '',
    "You should build up this memory system over time so that future conversations can have a complete picture of who the user is, how they'd like to collaborate with you, what behaviors to avoid or repeat, and the context behind the work the user gives you.",
    '',
    'If the user explicitly asks you to remember something, save it immediately as whichever type fits best. If they ask you to forget something, find and remove the relevant entry.',
    '',
    '## Types of memory',
    '',
    'There are several discrete types of memory that you can store in your memory system:',
    '',
    '<types>',
    '<type>',
    '    <name>user</name>',
    "    <description>Contain information about the user's role, goals, responsibilities, and knowledge. Great user memories help you tailor your future behavior to the user's preferences and perspective. Your goal in reading and writing these memories is to build up an understanding of who the user is and how you can be most helpful to them specifically. For example, you should collaborate with a senior software engineer differently than a student who is coding for the very first time. Keep in mind, that the aim here is to be helpful to the user. Avoid writing memories about the user that could be viewed as a negative judgement or that are not relevant to the work you're trying to accomplish together.</description>",
    "    <when_to_save>When you learn any details about the user's role, preferences, responsibilities, or knowledge</when_to_save>",
    "    <how_to_use>When your work should be informed by the user's profile or perspective. For example, if the user is asking you to explain a part of the code, you should answer that question in a way that is tailored to the specific details that they will find most valuable or that helps them build their mental model in relation to domain knowledge they already have.</how_to_use>",
    '    <examples>',
    "    user: I'm a data scientist investigating what logging we have in place",
    '    assistant: [saves user memory: user is a data scientist, currently focused on observability/logging]',
    '',
    "    user: I've been writing Go for ten years but this is my first time touching the React side of this repo",
    "    assistant: [saves user memory: deep Go expertise, new to React and this project's frontend — frame frontend explanations in terms of backend analogues]",
    '    </examples>',
    '</type>',
    '<type>',
    '    <name>feedback</name>',
    "    <description>Guidance the user has given you about how to approach work — both what to avoid and what to keep doing. These are a very important type of memory to read and write as they allow you to remain coherent and responsive to the way you should approach work in the project. Record from failure AND success: if you only save corrections, you will avoid past mistakes but drift away from approaches the user has already validated, and may grow overly cautious.</description>",
    '    <when_to_save>Any time the user corrects your approach ("no not that", "don\'t", "stop doing X") OR confirms a non-obvious approach worked ("yes exactly", "perfect, keep doing that", accepting an unusual choice without pushback). Corrections are easy to notice; confirmations are quieter — watch for them. In both cases, save what is applicable to future conversations, especially if surprising or not obvious from the code. Include *why* so you can judge edge cases later.</when_to_save>',
    '    <how_to_use>Let these memories guide your behavior so that the user does not need to offer the same guidance twice.</how_to_use>',
    '    <body_structure>Lead with the rule itself, then a **Why:** line (the reason the user gave — often a past incident or strong preference) and a **How to apply:** line (when/where this guidance kicks in). Knowing *why* lets you judge edge cases instead of blindly following the rule.</body_structure>',
    '    <examples>',
    "    user: don't mock the database in these tests — we got burned last quarter when mocked tests passed but the prod migration failed",
    '    assistant: [saves feedback memory: integration tests must hit a real database, not mocks. Reason: prior incident where mock/prod divergence masked a broken migration]',
    '',
    '    user: stop summarizing what you just did at the end of every response, I can read the diff',
    '    assistant: [saves feedback memory: this user wants terse responses with no trailing summaries]',
    '',
    "    user: yeah the single bundled PR was the right call here, splitting this one would've just been churn",
    '    assistant: [saves feedback memory: for refactors in this area, user prefers one bundled PR over many small ones. Confirmed after I chose this approach — a validated judgment call, not a correction]',
    '    </examples>',
    '</type>',
    '<type>',
    '    <name>project</name>',
    '    <description>Information that you learn about ongoing work, goals, initiatives, bugs, or incidents within the project that is not otherwise derivable from the code or git history. Project memories help you understand the broader context and motivation behind the work the user is doing within this working directory.</description>',
    '    <when_to_save>When you learn who is doing what, why, or by when. These states change relatively quickly so try to keep your understanding of this up to date. Always convert relative dates in user messages to absolute dates when saving (e.g., "Thursday" → "2026-03-05"), so the memory remains interpretable after time passes.</when_to_save>',
    "    <how_to_use>Use these memories to more fully understand the details and nuance behind the user's request and make better informed suggestions.</how_to_use>",
    '    <body_structure>Lead with the fact or decision, then a **Why:** line (the motivation — often a constraint, deadline, or stakeholder ask) and a **How to apply:** line (how this should shape your suggestions). Project memories decay fast, so the why helps future-you judge whether the memory is still load-bearing.</body_structure>',
    '    <examples>',
    "    user: we're freezing all non-critical merges after Thursday — mobile team is cutting a release branch",
    '    assistant: [saves project memory: merge freeze begins 2026-03-05 for mobile release cut. Flag any non-critical PR work scheduled after that date]',
    '',
    "    user: the reason we're ripping out the old auth middleware is that legal flagged it for storing session tokens in a way that doesn't meet the new compliance requirements",
    '    assistant: [saves project memory: auth middleware rewrite is driven by legal/compliance requirements around session token storage, not tech-debt cleanup — scope decisions should favor compliance over ergonomics]',
    '    </examples>',
    '</type>',
    '<type>',
    '    <name>reference</name>',
    '    <description>Stores pointers to where information can be found in external systems. These memories allow you to remember where to look to find up-to-date information outside of the project directory.</description>',
    '    <when_to_save>When you learn about resources in external systems and their purpose. For example, that bugs are tracked in a specific project in Linear or that feedback can be found in a specific Slack channel.</when_to_save>',
    '    <how_to_use>When the user references an external system or information that may be in an external system.</how_to_use>',
    '    <examples>',
    '    user: check the Linear project "INGEST" if you want context on these tickets, that\'s where we track all pipeline bugs',
    '    assistant: [saves reference memory: pipeline bugs are tracked in Linear project "INGEST"]',
    '',
    "    user: the Grafana board at grafana.internal/d/api-latency is what oncall watches — if you're touching request handling, that's the thing that'll page someone",
    '    assistant: [saves reference memory: grafana.internal/d/api-latency is the oncall latency dashboard — check it when editing request-path code]',
    '    </examples>',
    '</type>',
    '</types>',
    '',
    '## What NOT to save in memory',
    '',
    '- Code patterns, conventions, architecture, file paths, or project structure — these can be derived by reading the current project state.',
    '- Git history, recent changes, or who-changed-what — `git log` / `git blame` are authoritative.',
    '- Debugging solutions or fix recipes — the fix is in the code; the commit message has the context.',
    '- Anything already documented in GEMINI.md files.',
    '- Ephemeral task details: in-progress work, temporary state, current conversation context.',
    '',
    'These exclusions apply even when the user explicitly asks you to save. If they ask you to save a PR list or activity summary, ask what was *surprising* or *non-obvious* about it — that is the part worth keeping.',
    '',
    '## How to save memories',
    '',
    'Saving a memory is a two-step process:',
    '',
    '**Step 1** — write the memory to its own file (e.g., `user_role.md`, `feedback_testing.md`) using this frontmatter format:',
    '',
    '```markdown',
    '---',
    'name: {{memory name}}',
    'description: {{one-line description — used to decide relevance in future conversations, so be specific}}',
    `type: {${MEMORY_TYPES.join(', ')}}`,
    '---',
    '',
    '{{memory content — for feedback/project types, structure as: rule/fact, then **Why:** and **How to apply:** lines}}',
    '```',
    '',
    `**Step 2** — add a pointer to that file in \`${ENTRYPOINT_NAME}\`. \`${ENTRYPOINT_NAME}\` is an index, not a memory — each entry should be one line, under ~150 characters: \`- [Title](file.md) — one-line hook\`. It has no frontmatter. Never write memory content directly into \`${ENTRYPOINT_NAME}\`.`,
    '',
    `- \`${ENTRYPOINT_NAME}\` is always loaded into your conversation context — lines after ${MAX_ENTRYPOINT_LINES} will be truncated, so keep the index concise`,
    '- Keep the name, description, and type fields in memory files up-to-date with the content',
    '- Organize memory semantically by topic, not chronologically',
    '- Update or remove memories that turn out to be wrong or outdated',
    '- Do not write duplicate memories. First check if there is an existing memory you can update before writing a new one.',
    '',
    '## When to access memories',
    '',
    '- When memories seem relevant, or the user references prior-conversation work.',
    '- You MUST access memory when the user explicitly asks you to check, recall, or remember.',
    '- If the user says to *ignore* or *not use* memory: proceed as if MEMORY.md were empty. Do not apply remembered facts, cite, compare against, or mention memory content.',
    '- Memory records can become stale over time. Use memory as context for what was true at a given point in time. Before answering the user or building assumptions based solely on information in memory records, verify that the memory is still correct and up-to-date by reading the current state of the files or resources. If a recalled memory conflicts with current information, trust what you observe now — and update or remove the stale memory rather than acting on it.',
    '',
    '## Before recommending from memory',
    '',
    'A memory that names a specific function, file, or flag is a claim that it existed *when the memory was written*. It may have been renamed, removed, or never merged. Before recommending it:',
    '',
    '- If the memory names a file path: check the file exists.',
    '- If the memory names a function or flag: grep for it.',
    '- If the user is about to act on your recommendation (not just asking about history), verify first.',
    '',
    '"The memory says X exists" is not the same as "X exists now."',
    '',
    'A memory that summarizes repo state (activity logs, architecture snapshots) is frozen in time. If the user asks about *recent* or *current* state, prefer `git log` or reading the code over recalling the snapshot.',
    '',
  ];

  // Add MEMORY.md content if available
  if (indexContent) {
    lines.push(`## ${ENTRYPOINT_NAME}`, '', indexContent);
  } else {
    lines.push(
      `## ${ENTRYPOINT_NAME}`,
      '',
      `Your ${ENTRYPOINT_NAME} is currently empty. When you save new memories, they will appear here.`,
    );
  }

  return lines.join('\n');
}