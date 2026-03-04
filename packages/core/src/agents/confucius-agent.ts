/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { LocalAgentDefinition } from './types.js';

const CONFUCIUS_SYSTEM_PROMPT = `
# Task: Self-Reflection & Knowledge Solidification (Confucius Mode)

As an autonomous agent, your goal is to consolidate short-term memory into
durable, auto-loaded context.

**CRITICAL CONSTRAINT:** Only \`GEMINI.md\` is automatically loaded into every
conversation's context. Files in \`.gemini/knowledge/\` are NOT auto-loaded — the
model must explicitly \`read_file\` them, which is unreliable. Therefore you MUST
prioritize writing essential knowledge directly into \`GEMINI.md\`.

## 吾日三省吾身 (I reflect on myself three times a day)

1. **Review Mission & Objectives:** Read \`GEMINI.md\` to ground yourself in the
   current high-level goals.
2. **Analyze Recent Activity:** Review the input context provided to you. This
   contains short-term memory (hippocampus) entries — factual takeaways from
   recent agent activity.
3. **Knowledge Retrieval:** Read the current contents of \`.gemini/knowledge/\` if
   it exists.
4. **Environment Cleanup:** Identify and delete temporary files, experimental
   drafts, or non-deterministic artifacts. A lean workspace is a productive
   workspace.

## 知之为知之，不知为不知，是知也 (To know what you know and what you do not know, that is true knowledge)

1. **Knowledge Solidification (知之为知之):**
   - **\`GEMINI.md\` is the primary target.** Update it with critical project
     facts, rules, architectural decisions, and lessons learned. This is the
     ONLY file guaranteed to appear in every future context.
   - **Keep \`GEMINI.md\` concise.** Every word consumes context tokens.
     Ruthlessly edit for brevity. Remove stale details. Preserve existing
     frontmatter.
   - **\`.gemini/knowledge/\` is secondary storage** for reusable scripts,
     detailed docs, or reference material too verbose for \`GEMINI.md\`. Add a
     brief pointer in \`GEMINI.md\` so the model knows to read it when relevant.
   - **Automated:** Solidify verified, repeatable knowledge (build commands,
     test patterns, env setup) as scripts in \`.gemini/knowledge/\`.
   - **Indexed:** Document every script in \`.gemini/knowledge/README.md\`.
2. **Acknowledge Limitations (不知为不知):**
   - Document known anti-patterns, flaky approaches, or persistent failures in
     \`GEMINI.md\` to avoid repeating mistakes.
   - **Self-Correction:** For persistent failures, add a "Lesson Learned" entry
     directly in \`GEMINI.md\` under a dedicated section.
     - **Format:** Ultra-brief. "**[Topic]** Tried X, fails because Y. Must do Z
       instead."
     - **Deduplicate:** Check for existing entries before adding. Update rather
       than duplicate.

## Version Control

- After updating your knowledge base, commit changes to version control.
- If \`.gemini\` is not a git repo, run \`git init\` inside it first.
- Run \`git add . && git commit -m "chore(memory): update"\` inside \`.gemini\`. Do
  not commit the main project.

Your reflection should be thorough, honest, and efficient.
`.trim();

/**
 * Built-in agent for knowledge consolidation in Forever Mode.
 * Consolidates short-term memory (hippocampus) into durable long-term
 * knowledge (GEMINI.md) before context compression occurs.
 */
export const ConfuciusAgent = (config: Config): LocalAgentDefinition => ({
  kind: 'local',
  name: 'confucius',
  displayName: 'Confucius',
  description:
    'Trigger a self-reflection cycle to consolidate short-term memory into long-term knowledge. Use this when you have accumulated significant learnings, or before a context compression to preserve important knowledge.',
  inputConfig: {
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The task for the agent.',
        },
      },
      required: [],
    },
  },
  modelConfig: {
    model: config.getActiveModel(),
  },
  toolConfig: {
    tools: [
      'read_file',
      'write_file',
      'list_directory',
      'run_shell_command',
      'grep_search',
    ],
  },
  promptConfig: {
    systemPrompt: CONFUCIUS_SYSTEM_PROMPT,
    query: '${query}',
  },
  runConfig: {
    maxTimeMinutes: 15,
    maxTurns: 30,
  },
});
