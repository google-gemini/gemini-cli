/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { LocalAgentDefinition } from './types.js';
import {
  ASK_USER_TOOL_NAME,
  EDIT_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from '../tools/tool-names.js';
import { Storage } from '../config/storage.js';
import { flattenMemory } from '../config/memory.js';
import { GEMINI_MODEL_ALIAS_FLASH } from '../config/models.js';
import type { Config } from '../config/config.js';

const MemoryManagerSchema = z.object({
  response: z
    .string()
    .describe('A summary of the memory operations performed.'),
});

/**
 * A memory management agent that replaces the built-in save_memory tool.
 * It provides richer memory operations: adding, removing, de-duplicating,
 * and organizing memories in the global GEMINI.md file.
 *
 * Users can override this agent by placing a custom save_memory.md
 * in ~/.gemini/agents/ or .gemini/agents/.
 */
export const MemoryManagerAgent = (
  config: Config,
): LocalAgentDefinition<typeof MemoryManagerSchema> => {
  const globalGeminiDir = Storage.getGlobalGeminiDir();

  const getInitialContext = (): string => {
    const memory = config.getUserMemory();
    // Only include global and project memory — extension memory is read-only
    // and not relevant to the memory manager.
    const content =
      typeof memory === 'string'
        ? memory
        : flattenMemory({ global: memory.global, project: memory.project });
    if (!content.trim()) return '';
    return `\n# Initial Context\n\n${content}\n`;
  };

  const buildSystemPrompt = (): string =>
    `
You are a memory management agent maintaining user memories in GEMINI.md files.

# Memory Hierarchy

## Global (${globalGeminiDir})
- \`${globalGeminiDir}/GEMINI.md\` — Cross-project user preferences, key personal info,
  and habits that apply everywhere.

## Project (./)
- \`./GEMINI.md\` — **Table of Contents** for project-specific context:
  architecture decisions, conventions, key contacts, and references to
  subdirectory GEMINI.md files for detailed context.
- Subdirectory GEMINI.md files (e.g. \`src/GEMINI.md\`, \`docs/GEMINI.md\`) —
  detailed, domain-specific context for that part of the project. Reference
  these from the root \`./GEMINI.md\`.

## Routing

When adding a memory, route it to the right store:
- **Global**: User preferences, personal info, tool aliases, cross-project habits → **global**
- **Project Root**: Project architecture, conventions, workflows, team info → **project root**
- **Subdirectory**: Detailed context about a specific module or directory → **subdirectory
  GEMINI.md**, with a reference added to the project root

- **Ambiguity**: If a memory (like a coding preference or workflow) could be interpreted as either a global habit or a project-specific convention, you **MUST** use \`${ASK_USER_TOOL_NAME}\` to clarify the user's intent. Do NOT make a unilateral decision when ambiguity exists between Global and Project stores.

# Operations

1. **Adding** — Route to the correct store and file. Check for duplicates in your provided context first.
2. **Removing stale entries** — Delete outdated or unwanted entries. Clean up
   dangling references.
3. **De-duplicating** — Semantically equivalent entries should be combined. Keep the most informative version.
4. **Organizing** — Restructure for clarity. Update references between files.

# Restrictions
- Keep GEMINI.md files lean — they are loaded into context every session.
- Keep entries concise.
- Edit surgically — preserve existing structure and user-authored content.
- NEVER write or read any files other than GEMINI.md files.

# Efficiency & Performance
- **Use as few turns as possible.** Execute independent reads and writes to different files in parallel by calling multiple tools in a single turn.
- **Do not perform any exploration of the codebase.** Try to use the provided file context and only search additional GEMINI.md files as needed to accomplish your task.
- **Be strategic with your thinking.** carefully decide where to route memories and how to de-duplicate memories, but be decisive with simple memory writes.
- **Minimize file system operations.** You should typically only modify the GEMINI.md files that are already provided in your context. Only read or write to other files if explicitly directed or if you are following a specific reference from an existing memory file.
- **Context Awareness.** If a file's content is already provided in the "Initial Context" section, you do not need to call \`read_file\` for it.

# Insufficient context
If you find that you have insufficient context to read or modify the memories as described,
reply with what you need, and exit. Do not search the codebase for the missing context.
`.trim();

  return {
    kind: 'local',
    name: 'save_memory',
    displayName: 'Memory Manager',
    description: `Writes and reads memory, preferences or facts across ALL future sessions. Use this for recurring instructions like coding styles or tool aliases.`,
    inputConfig: {
      inputSchema: {
        type: 'object',
        properties: {
          request: {
            type: 'string',
            description:
              'The memory operation to perform. Examples: "Remember that I prefer tabs over spaces", "Clean up stale memories", "De-duplicate my memories", "Organize my memories".',
          },
        },
        required: ['request'],
      },
    },
    outputConfig: {
      outputName: 'result',
      description: 'A summary of the memory operations performed.',
      schema: MemoryManagerSchema,
    },
    modelConfig: {
      model: GEMINI_MODEL_ALIAS_FLASH,
    },
    workspaceDirectories: [globalGeminiDir],
    toolConfig: {
      tools: [
        READ_FILE_TOOL_NAME,
        EDIT_TOOL_NAME,
        WRITE_FILE_TOOL_NAME,
        LS_TOOL_NAME,
        GLOB_TOOL_NAME,
        GREP_TOOL_NAME,
        ASK_USER_TOOL_NAME,
      ],
    },
    get promptConfig() {
      return {
        systemPrompt: buildSystemPrompt(),
        query: `${getInitialContext()}\${request}`,
      };
    },
    runConfig: {
      maxTimeMinutes: 5,
      maxTurns: 10,
    },
  };
};
