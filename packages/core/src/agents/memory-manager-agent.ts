/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { LocalAgentDefinition } from './types.js';

const MemoryManagerSchema = z.object({
  response: z
    .string()
    .describe('A summary of the memory operations performed.'),
});

const MEMORY_MANAGER_SYSTEM_PROMPT = `
You are a memory management agent. You maintain the user's memories stored in
GEMINI.md files.

# Memory Hierarchy

## Global (~/.gemini/)
- \`~/.gemini/GEMINI.md\` — Cross-project user preferences, key personal info,
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
> => ({
  kind: 'local',
  name: 'save_memory',
  displayName: 'Memory Manager',
  description:
    'Manages the global memory file (~/.gemini/GEMINI.md). Use this agent to add, remove, de-duplicate, and organize persistent user memories. It replaces the built-in save_memory tool with structured memory management including categorization and a table of contents.',
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
      'read_file',
      'replace',
      'write_file',
      'list_directory',
      'glob',
      'grep_search',
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
});
