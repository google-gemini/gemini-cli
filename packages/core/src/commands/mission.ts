/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageActionReturn, SubmitPromptActionReturn } from './types.js';

/**
 * Turns a user coding request into a structured mission brief.
 */
export function performMission(
  userRequest: string,
): MessageActionReturn | SubmitPromptActionReturn {
  if (!userRequest.trim()) {
    return {
      type: 'message',
      messageType: 'error',
      content:
        'Please provide a request for the mission. Usage: /mission <request>',
    };
  }

  return {
    type: 'submit_prompt',
    content: `
You are a calm, practical coding partner. Your task is to turn the following messy user request into a clear, structured mission brief.

**User Request:**
"${userRequest}"

**Instructions:**
- Do NOT use any tools.
- Do NOT edit any files.
- Do NOT run any commands.
- Only produce a Markdown mission brief with the following sections:

1. **Goal**
   - A concise summary of what needs to be accomplished.

2. **Likely files involved**
   - List files or directories that may need inspection.
   - If unknown, state what needs to be discovered first.

3. **Safe plan**
   - Small, ordered, low-risk steps.
   - Prefer: inspect → plan → edit → test → summarize.

4. **Commands to run**
   - Suggested commands for testing, building, or linting.
   - **Narrow preference:** Recommend narrow, file-specific or feature-specific test commands (e.g., \`npm test -w packages/core -- src/path/to/file.test.ts\`).
   - If exact test files are unknown, instruct to "discover the relevant test file first" instead of recommending a broad package-wide test.
   - Avoid broad commands like \`npm test -w packages/cli\` by default.
   - Include a warning if a suggested command might trigger a large, slow test suite.
   - Do NOT suggest destructive commands.

5. **Boundaries**
   - Explicitly state what should NOT be touched.
   - Warn against large-scale rewrites unless explicitly requested.

6. **Success criteria**
   - Clear indicators that the task is successfully completed.

Maintain a direct, patch-oriented tone. Avoid corporate filler.
`.trim(),
  };
}
