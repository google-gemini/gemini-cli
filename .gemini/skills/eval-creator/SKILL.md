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

2.  **Deeply Understand Bug:**
    *   Explore the relevant parts of the codebase as needed to fully understand the bug and the conditions under which it repros.
    *   Use scripts, if needed, to test your hypotheses as to what the problem is.
    *   Proceed to the next step only after you fully understand what causes the issue.

3.  **Minimize and Anonymize:**
    *   Identify the "Repro Turn": the specific user prompt where the agent failed. You will want to make the test prompt either an anonymized version of that prompt or one of the messages far enough back in the history that the agent can recover when the bug is fixed later.
    *   **CRITICAL:** Anonymize all data. Replace absolute file paths (e.g., `/Users/username/code/...`) with generic relative paths (e.g., `src/app.ts`). Remove any sensitive tokens, API keys, or personal information. Replace user-specific, company-specific, or domain-specific code and names with generic, simplified code snippets that still reproduce the issue.

4.  **Reconstruct Initial State:**
    *   Determine the minimal set of files and their contents required to exist *before* the target prompt is issued. This will become the `files` object in the test.

5.  **Generate Test Code:**
    *   Create a valid TypeScript file using the `evalTest` framework from `evals/test-helper.ts`.
    *   **MANDATORY:** Use the `messages` array to include essential preceding context to setup the repro scenario. You can start with as much as you need and whittle it back.
    *   Remember to anonymize before you are done.
    *   Use the following test template:

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

5.  **Verify and Refine (Loop):**
    *   **MANDATORY:** After generating the test file, run it using `npx vitest run evals/<descriptive-name>.eval.ts`.
    *   Analyze the results:
        *   **If the test passes:** The reproduction failed. Refine the `messages`, `files`, or `prompt` to more accurately capture the state that triggered the bug. It may help to add messages to the history to make the scenario more realistic and true to the repro in chat.json.
        *   **If the test fails for the WRONG reason:** (e.g., a crash in the test setup, or a different bug), fix the test code or setup.
        *   **If the test fails for the EXPECTED reason:** The bug is successfully reproduced.
    *   **Iterate** until you have a valid, stable failure that clearly demonstrates the bug.

6.  **Finalize:**
    *   Inform the user that the file has been created and verified as a failing repro.
    *   Include instructions on how to run the test:
        ```bash
        # Run only the new eval test
        RUN_EVALS=1 npx vitest run --config evals/vitest.config.ts evals/<descriptive-name>.eval.ts
        ```
    *   Remind them to manually review the assertions and ensure complete anonymization before committing.
