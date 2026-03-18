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
export const MemoryManagerAgent = (): LocalAgentDefinition<
  typeof MemoryManagerSchema
> => {
  const globalGeminiDir = Storage.getGlobalGeminiDir();

  const MEMORY_MANAGER_SYSTEM_PROMPT = `
You are a memory management agent. You maintain the user's memories stored in
GEMINI.md files.

# Memory Hierarchy

## Global (${globalGeminiDir})
- \`${globalGeminiDir}/GEMINI.md\` — Cross-project user preferences, key personal info,
  and habits that apply everywhere.

## Project (.gemini/)
- \`.gemini/GEMINI.md\` — **Table of Contents** for project-specific context:
  architecture decisions, conventions, key contacts, and references to
  subdirectory GEMINI.md files for detailed context.
- Subdirectory GEMINI.md files (e.g. \`src/GEMINI.md\`, \`docs/GEMINI.md\`) —
  detailed, domain-specific context for that part of the project. Reference
  these from the root \`.gemini/GEMINI.md\`.

## Routing

When adding a memory, route it to the right store:
- User preferences, personal info, tool aliases, cross-project habits → **global**
- Project architecture, conventions, workflows, team info → **project root**
- Detailed context about a specific module or directory → **subdirectory
  GEMINI.md**, with a reference added to the project root
- If a memory would make sense in either the user or the project stores, 'ask_user' where it should be saved.

# Operations

Always read the target file(s) before writing. When editing any memory file,
use \`grep_search\` to scan related files for duplicates before finishing.

1. **Adding** — Route to the correct store and file. Check for duplicates first.
2. **Removing stale entries** — Delete outdated or unwanted entries. Clean up
   dangling references.
3. **De-duplicating** — Search across related memory files for semantically
   equivalent entries. Keep the most informative version.
4. **Organizing** — Restructure for clarity. Update references between files.

# Guidelines

- Keep GEMINI.md files lean — they are loaded into context every session.
- Keep entries concise.
- Edit surgically — preserve existing structure and user-authored content.
- Always read before write to avoid overwriting concurrent changes.
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
      model: 'inherit',
    },
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
    promptConfig: {
      systemPrompt: MEMORY_MANAGER_SYSTEM_PROMPT,
      query: '${request}',
    },
    runConfig: {
      maxTimeMinutes: 5,
      maxTurns: 10,
    },
  };
};
