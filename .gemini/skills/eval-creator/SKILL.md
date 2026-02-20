---
name: eval-creator
description: Converts exported `chat.json` conversation files into minimal, anonymized, and reproducible behavioral evaluation tests.
---

# eval-creator

## Description
Converts exported `chat.json` conversation files into minimal, anonymized, and reproducible behavioral evaluation tests (`.eval.ts`) for the Gemini CLI `evalTest` framework.

## Instructions

When the user asks you to create an eval from a `chat.json` file, follow these steps strictly:

1.  **Read and Identify Bugs:**
    *   Use `read_file` to examine the contents of the provided `chat.json` file.
    *   **CRITICAL:** Before deeply analyzing the file, ask the user what type of issue they are targeting:
        1. **Agent Misbehavior:** A bug with the agent itself (e.g., tool misuse, failing to follow instructions, hallucinating tool names/parameters, `replace` tool mismatch errors).
        2. **Solution Issue:** A problem with the code or strategy the agent produced (e.g., the code didn't compile, lint errors, missed architectural constraints, bad strategy).
    *   Once the user clarifies the category, analyze the conversation history (the `Content[]` array) to identify *only* those failures, bugs, or regressions that match the specified category.
    *   Present a concise summary of the matching potential bugs to the user and **ask them which specific issues they want you to create evaluations for.** Do NOT proceed to create files until the user confirms.

2.  **Minimize and Anonymize:**
    *   Identify the "Repro Turn": the specific user prompt where the agent failed.
    *   Discard all preceding conversation turns that are not strictly necessary to set up the environment or trigger the behavior.
    *   For the remaining preceding turns, anonymize and keep them in a `messages` array.
    *   **CRITICAL:** Anonymize all data. Replace absolute file paths (e.g., `/Users/username/code/...`) with generic relative paths (e.g., `src/app.ts`). Remove any sensitive tokens, API keys, or personal information. Replace user-specific code with generic, simplified code snippets that still reproduce the issue.

3.  **Reconstruct Initial State:**
    *   Determine the minimal set of files and their contents required to exist *before* the target prompt is issued. This will become the `files` object in the test.

4.  **Generate Test Code:**
    *   Create a valid TypeScript file using the `evalTest` framework from `evals/test-helper.ts`.
    *   Use the following template:

```typescript
import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('chat-to-eval-generated', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should <describe expected behavior>',
    prompt: '<the repro user prompt>',
    // Use messages to replay a realistic history leading up to the repro prompt.
    // This makes the test faster and avoids re-executing established context.
    messages: [
       // { id: '...', type: 'user', content: [{ text: '...' }], timestamp: '...' },
       // { id: '...', type: 'gemini', content: [{ text: '...' }], timestamp: '...' },
    ],
    files: {
      'path/to/mock/file.ts': '...',
    },
    assert: async (rig, result) => {
      // Add assertions based on expected model behavior.
      // Example:
      // const logs = rig.readToolLogs();
      // expect(logs.some(l => l.toolRequest.name === 'write_file')).toBe(true);
      // expect(rig.readFile('path/to/mock/file.ts')).toContain('...');
    },
  });
});
```

5.  **Validate and Finalize:**
    *   **CRITICAL:** An evaluation is only valid to add if it is **initially failing** (demonstrating the bug or missing behavior). Skip this requirement only if you have clear evidence that the user has already applied a fix and is using the test for regression verification.
    *   Inform the user that the file has been created.
    *   Include instructions on how to run the test to verify failure/success:
        ```bash
        # Run only the new eval test
        RUN_EVALS=1 npx vitest run --config evals/vitest.config.ts evals/<descriptive-name>.eval.ts

        # Run all evals (including 'USUALLY_PASSES')
        npm run test:all_evals

        # Run only 'ALWAYS_PASSES' evals
        npm run test:always_passing_evals
        ```
    *   Remind them to manually review the assertions and ensure complete anonymization before committing.
