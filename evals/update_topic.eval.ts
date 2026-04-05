/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { evalTest } from './test-helper.js';

describe('update_topic_behavior', () => {
  // Constants for tool names and params for robustness
  const UPDATE_TOPIC_TOOL_NAME = 'update_topic';

  /**
   * Verifies the desired behavior of the update_topic tool. update_topic is used by the
   * agent to share periodic, concise updates about what the agent is working on, independent
   * of the regular model output and/or thoughts. This tool is expected to be called at least
   * at the start and end of the session, and typically at least once in the middle, but no
   * more than 1/4 turns.
   */
  evalTest('USUALLY_PASSES', {
    name: 'update_topic should be used at start, end and middle for complex tasks',
    prompt: `Create a simple users REST API using Express. 
1. Initialize a new npm project and install express.
2. Create src/app.ts as the main entry point.
3. Create src/routes/userRoutes.ts for user routes.
4. Create src/controllers/userController.ts for user logic.
5. Implement GET /users, POST /users, and GET /users/:id using an in-memory array.
6. Add a 'start' script to package.json.
7. Finally, run a quick grep to verify the routes are in src/app.ts.`,
    files: {
      'package.json': JSON.stringify(
        {
          name: 'users-api',
          version: '1.0.0',
          private: true,
        },
        null,
        2,
      ),
      '.gemini/settings.json': JSON.stringify({
        experimental: {
          topicUpdateNarration: true,
        },
      }),
    },
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();
      const topicCalls = toolLogs.filter(
        (l) => l.toolRequest.name === UPDATE_TOPIC_TOOL_NAME,
      );

      // 1. Assert that update_topic is called at least 3 times (start, middle, end)
      expect(
        topicCalls.length,
        `Expected at least 3 update_topic calls, but found ${topicCalls.length}`,
      ).toBeGreaterThanOrEqual(3);

      // 2. Assert update_topic is called at the very beginning (first tool call)
      expect(
        toolLogs[0].toolRequest.name,
        'First tool call should be update_topic',
      ).toBe(UPDATE_TOPIC_TOOL_NAME);

      // 3. Assert update_topic is called near the end
      const lastTopicCallIndex = toolLogs
        .map((l) => l.toolRequest.name)
        .lastIndexOf(UPDATE_TOPIC_TOOL_NAME);
      expect(
        lastTopicCallIndex,
        'Expected update_topic to be used near the end of the task',
      ).toBeGreaterThanOrEqual(toolLogs.length * 0.7);

      // 4. Assert there is at least one update_topic call in the middle (between start and end phases)
      const middleTopicCalls = topicCalls.slice(1, -1);

      expect(
        middleTopicCalls.length,
        'Expected at least one update_topic call in the middle of the task',
      ).toBeGreaterThanOrEqual(1);

      // 5. Turn Ratio Assertion: update_topic should be <= 1/2 of total turns.
      // We only enforce this for tasks that take more than 5 turns, as shorter tasks
      // naturally have a higher ratio when following the "start, middle, end" rule.
      const uniquePromptIds = new Set(
        toolLogs
          .map((l) => l.toolRequest.prompt_id)
          .filter((id) => id !== undefined),
      );
      const totalTurns = uniquePromptIds.size;

      if (totalTurns > 5) {
        const topicTurns = new Set(
          topicCalls
            .map((l) => l.toolRequest.prompt_id)
            .filter((id) => id !== undefined),
        );
        const topicTurnCount = topicTurns.size;

        const ratio = topicTurnCount / totalTurns;

        expect(
          ratio,
          `update_topic was used in ${topicTurnCount} out of ${totalTurns} turns (${(ratio * 100).toFixed(1)}%). Expected <= 50%.`,
        ).toBeLessThanOrEqual(0.5);

        // Ideal ratio is closer to 1/5 (20%). We log high usage as a warning.
        if (ratio > 0.25) {
          console.warn(
            `[Efficiency Warning] update_topic usage is high: ${(ratio * 100).toFixed(1)}% (Goal: ~20%)`,
          );
        }
      }
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'update_topic should NOT be used for informational coding tasks (Obvious)',
    approvalMode: 'default',
    prompt:
      'Explain the difference between Map and Object in JavaScript and provide a performance-focused code snippet for each.',
    files: {
      '.gemini/settings.json': JSON.stringify({
        experimental: {
          topicUpdateNarration: true,
        },
      }),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const topicCalls = toolLogs.filter(
        (l) => l.toolRequest.name === UPDATE_TOPIC_TOOL_NAME,
      );

      expect(
        topicCalls.length,
        `Expected 0 update_topic calls for an informational task, but found ${topicCalls.length}`,
      ).toBe(0);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'update_topic should NOT be used for surgical symbol searches (Grey Area)',
    approvalMode: 'default',
    prompt:
      "Find the file where the 'UPDATE_TOPIC_TOOL_NAME' constant is defined.",
    files: {
      'packages/core/src/tools/tool-names.ts':
        "export const UPDATE_TOPIC_TOOL_NAME = 'update_topic';",
      '.gemini/settings.json': JSON.stringify({
        experimental: {
          topicUpdateNarration: true,
        },
      }),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const topicCalls = toolLogs.filter(
        (l) => l.toolRequest.name === UPDATE_TOPIC_TOOL_NAME,
      );

      expect(
        topicCalls.length,
        `Expected 0 update_topic calls for a surgical symbol search, but found ${topicCalls.length}`,
      ).toBe(0);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'update_topic should be used for medium complexity multi-step tasks',
    prompt:
      'Refactor the `users-api` project. Move the routing logic from src/app.ts into a new file src/routes.ts, and update app.ts to use the new routes file.',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'users-api',
          version: '1.0.0',
        },
        null,
        2,
      ),
      'src/app.ts': `
import express from 'express';
const app = express();

app.get('/users', (req, res) => {
  res.json([{id: 1, name: 'Alice'}]);
});

app.post('/users', (req, res) => {
  res.status(201).send();
});

export default app;
      `,
      '.gemini/settings.json': JSON.stringify({
        experimental: {
          topicUpdateNarration: true,
        },
      }),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const topicCalls = toolLogs.filter(
        (l) => l.toolRequest.name === UPDATE_TOPIC_TOOL_NAME,
      );

      // This is a multi-step task (read, create new file, edit old file).
      // It should clear the bar and use update_topic at least at the start and end.
      expect(topicCalls.length).toBeGreaterThanOrEqual(2);

      // Verify it actually did the refactoring to ensure it didn't just fail immediately
      expect(fs.existsSync(path.join(rig.testDir, 'src/routes.ts'))).toBe(true);
    },
  });
});
