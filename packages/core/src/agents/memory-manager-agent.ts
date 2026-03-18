/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
import { isSubpath, normalizePath } from '../utils/paths.js';

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
  projectRoot?: string,
): LocalAgentDefinition<typeof MemoryManagerSchema> => {
  const globalGeminiDir = Storage.getGlobalGeminiDir();

  const getInitialContext = (): string => {
    const cwd = process.cwd();
    const filesToRead = new Set<string>();

    // Global GEMINI.md
    filesToRead.add(path.join(globalGeminiDir, 'GEMINI.md'));

    if (projectRoot) {
      // Project root .gemini/GEMINI.md
      filesToRead.add(path.join(projectRoot, '.gemini', 'GEMINI.md'));

      // GEMINI.md files from cwd up to project root
      if (
        isSubpath(projectRoot, cwd) ||
        normalizePath(projectRoot) === normalizePath(cwd)
      ) {
        let current = cwd;
        while (true) {
          filesToRead.add(path.join(current, 'GEMINI.md'));
          if (normalizePath(current) === normalizePath(projectRoot)) break;
          const parent = path.dirname(current);
          if (parent === current) break;
          current = parent;
        }
      }
    }

    let context = '\n# Initial Context\n\n';
    let foundAny = false;

    for (const file of filesToRead) {
      try {
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          const content = fs.readFileSync(file, 'utf-8');
          context += `## File: ${file}\n\`\`\`markdown\n${content}\n\`\`\`\n\n`;
          foundAny = true;
        }
      } catch {
        // Ignore errors reading files
      }
    }

    return foundAny ? context : '';
  };

  const buildSystemPrompt = (): string =>
    `
You are a memory management agent maintaining user memories in GEMINI.md files.

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
- **Global**: User preferences, personal info, tool aliases, cross-project habits → **global**
- **Project Root**: Project architecture, conventions, workflows, team info → **project root**
- **Subdirectory**: Detailed context about a specific module or directory → **subdirectory
  GEMINI.md**, with a reference added to the project root

- **Ambiguity**: If a memory (like a coding preference or workflow) could be interpreted as either a global habit or a project-specific convention, you **MUST** use \`ask_user\` to clarify the user's intent. Do NOT make a unilateral decision when ambiguity exists between Global and Project stores.

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
${getInitialContext()}
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
      model: 'gemini-3-flash-preview',
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
    get promptConfig() {
      return {
        systemPrompt: buildSystemPrompt(),
        query: '${request}',
      };
    },
    runConfig: {
      maxTimeMinutes: 5,
      maxTurns: 10,
    },
  };
};
