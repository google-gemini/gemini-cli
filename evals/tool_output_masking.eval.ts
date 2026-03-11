/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Recursive function to find a directory by name
function findDir(base: string, name: string): string | null {
  if (!fs.existsSync(base)) return null;
  const files = fs.readdirSync(base);
  for (const file of files) {
    const fullPath = path.join(base, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file === name) return fullPath;
      const found = findDir(fullPath, name);
      if (found) return found;
    }
  }
  return null;
}

describe('Tool Output Masking Behavioral Evals', () => {
  /**
   * Scenario: The agent needs information that was masked in a previous turn.
   * It should recognize the <tool_output_masked> tag and use a tool to read the file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should attempt to read the redirected full output file when information is masked',
    params: {
      security: {
        folderTrust: {
          enabled: true,
        },
      },
    },
    prompt: '/help',
    assert: async (rig) => {
      // 1. Initialize project directories
      await rig.run({ args: '/help' });

      // 2. Discover the project temp dir
      const chatsDir = findDir(path.join(rig.homeDir!, '.gemini'), 'chats');
      if (!chatsDir) throw new Error('Could not find chats directory');
      const projectTempDir = path.dirname(chatsDir);

      const sessionId = crypto.randomUUID();
      const toolOutputsDir = path.join(
        projectTempDir,
        'tool-outputs',
        `session-${sessionId}`,
      );
      fs.mkdirSync(toolOutputsDir, { recursive: true });

      const secretValue = 'THE_RECOVERED_SECRET_99';
      const outputFileName = `masked_output_${crypto.randomUUID()}.txt`;
      const outputFilePath = path.join(toolOutputsDir, outputFileName);
      fs.writeFileSync(
        outputFilePath,
        `Some padding...\nThe secret key is: ${secretValue}\nMore padding...`,
      );

      const maskedSnippet = `<tool_output_masked>
Output: [PREVIEW]
Output too large. Full output available at: ${outputFilePath}
</tool_output_masked>`;

      // 3. Inject manual session file
      const conversation = {
        sessionId: sessionId,
        projectHash: path.basename(projectTempDir),
        startTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        messages: [
          {
            id: 'msg_1',
            timestamp: new Date().toISOString(),
            type: 'user',
            content: [{ text: 'Get secret.' }],
          },
          {
            id: 'msg_2',
            timestamp: new Date().toISOString(),
            type: 'gemini',
            model: 'gemini-3-flash-preview',
            toolCalls: [
              {
                id: 'call_1',
                name: 'run_shell_command',
                args: { command: 'get_secret' },
                status: 'success',
                timestamp: new Date().toISOString(),
                result: [
                  {
                    functionResponse: {
                      id: 'call_1',
                      name: 'run_shell_command',
                      response: { output: maskedSnippet },
                    },
                  },
                ],
              },
            ],
            content: [{ text: 'I found a masked output.' }],
          },
        ],
      };

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      conversation.startTime = futureDate.toISOString();
      conversation.lastUpdated = futureDate.toISOString();
      const timestamp = futureDate
        .toISOString()
        .slice(0, 16)
        .replace(/:/g, '-');
      const sessionFile = path.join(
        chatsDir,
        `session-${timestamp}-${sessionId.slice(0, 8)}.json`,
      );
      fs.writeFileSync(sessionFile, JSON.stringify(conversation, null, 2));

      // 4. Trust folder
      const settingsDir = path.join(rig.homeDir!, '.gemini');
      fs.writeFileSync(
        path.join(settingsDir, 'trustedFolders.json'),
        JSON.stringify(
          {
            [path.resolve(rig.homeDir!)]: 'TRUST_FOLDER',
          },
          null,
          2,
        ),
      );

      // 5. Run agent with --resume
      const result = await rig.run({
        args: [
          '--resume',
          'latest',
          'What was the secret key in that last masked shell output?',
        ],
        approvalMode: 'yolo',
        timeout: 120000,
      });

      // ASSERTION: Verify agent accessed the redirected file
      const logs = rig.readToolLogs();
      const accessedFile = logs.some((log) =>
        log.toolRequest.args.includes(outputFileName),
      );

      expect(
        accessedFile,
        `Agent should have attempted to access the masked output file: ${outputFileName}`,
      ).toBe(true);
      expect(result.toLowerCase()).toContain(secretValue.toLowerCase());
    },
  });

  /**
   * Scenario: Information is in the preview.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should NOT read the full output file when the information is already in the preview',
    params: {
      security: {
        folderTrust: {
          enabled: true,
        },
      },
    },
    prompt: '/help',
    assert: async (rig) => {
      await rig.run({ args: '/help' });

      const chatsDir = findDir(path.join(rig.homeDir!, '.gemini'), 'chats');
      if (!chatsDir) throw new Error('Could not find chats directory');
      const projectTempDir = path.dirname(chatsDir);

      const sessionId = crypto.randomUUID();
      const toolOutputsDir = path.join(
        projectTempDir,
        'tool-outputs',
        `session-${sessionId}`,
      );
      fs.mkdirSync(toolOutputsDir, { recursive: true });

      const secretValue = 'PREVIEW_SECRET_123';
      const outputFileName = `masked_output_${crypto.randomUUID()}.txt`;
      const outputFilePath = path.join(toolOutputsDir, outputFileName);
      fs.writeFileSync(
        outputFilePath,
        `Full content containing ${secretValue}`,
      );

      const maskedSnippet = `<tool_output_masked>
Output: The secret key is: ${secretValue}
... lines omitted ...

Output too large. Full output available at: ${outputFilePath}
</tool_output_masked>`;

      const conversation = {
        sessionId: sessionId,
        projectHash: path.basename(projectTempDir),
        startTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        messages: [
          {
            id: 'msg_1',
            timestamp: new Date().toISOString(),
            type: 'user',
            content: [{ text: 'Find secret.' }],
          },
          {
            id: 'msg_2',
            timestamp: new Date().toISOString(),
            type: 'gemini',
            model: 'gemini-3-flash-preview',
            toolCalls: [
              {
                id: 'call_1',
                name: 'run_shell_command',
                args: { command: 'get_secret' },
                status: 'success',
                timestamp: new Date().toISOString(),
                result: [
                  {
                    functionResponse: {
                      id: 'call_1',
                      name: 'run_shell_command',
                      response: { output: maskedSnippet },
                    },
                  },
                ],
              },
            ],
            content: [{ text: 'Masked output found.' }],
          },
        ],
      };

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      conversation.startTime = futureDate.toISOString();
      conversation.lastUpdated = futureDate.toISOString();
      const timestamp = futureDate
        .toISOString()
        .slice(0, 16)
        .replace(/:/g, '-');
      const sessionFile = path.join(
        chatsDir,
        `session-${timestamp}-${sessionId.slice(0, 8)}.json`,
      );
      fs.writeFileSync(sessionFile, JSON.stringify(conversation, null, 2));

      const settingsDir = path.join(rig.homeDir!, '.gemini');
      fs.writeFileSync(
        path.join(settingsDir, 'trustedFolders.json'),
        JSON.stringify(
          {
            [path.resolve(rig.homeDir!)]: 'TRUST_FOLDER',
          },
          null,
          2,
        ),
      );

      const result = await rig.run({
        args: [
          '--resume',
          'latest',
          'What was the secret key mentioned in the previous output?',
        ],
        approvalMode: 'yolo',
        timeout: 120000,
      });

      const logs = rig.readToolLogs();
      const accessedFile = logs.some((log) =>
        log.toolRequest.args.includes(outputFileName),
      );

      expect(
        accessedFile,
        'Agent should NOT have accessed the masked output file',
      ).toBe(false);
      expect(result.toLowerCase()).toContain(secretValue.toLowerCase());
    },
  });
});
