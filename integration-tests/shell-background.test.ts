/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('shell-background-tools', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should run a command in the background, list it, and read its output', async () => {
    // We use a fake responses file to make the test deterministic and run in CI.
    rig.setup('shell-background-workflow', {
      fakeResponsesPath: join(__dirname, 'shell-background.responses'),
      settings: {
        tools: {
          core: [
            'run_shell_command',
            'list_background_processes',
            'read_background_output',
          ],
        },
        hooksConfig: {
          enabled: true,
        },
        hooks: {
          BeforeTool: [
            {
              matcher: 'run_shell_command',
              hooks: [
                {
                  type: 'command',
                  // This hook intercepts run_shell_command.
                  // If is_background is true, it returns a mock result with PID 12345.
                  // It also creates the mock log file that read_background_output expects.
                  command: `node -e "
                    const fs = require('fs');
                    const path = require('path');
                    const input = JSON.parse(fs.readFileSync(0, 'utf-8'));
                    const args = JSON.parse(input.tool_call.args);
                    
                    if (args.is_background) {
                      const logDir = path.join(process.env.GEMINI_CLI_HOME, 'background-processes');
                      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
                      fs.writeFileSync(path.join(logDir, 'background-12345.log'), 'hello-from-background\\n');
                      
                      console.log(JSON.stringify({
                        decision: 'replace',
                        hookSpecificOutput: {
                          result: {
                            llmContent: 'Command moved to background (PID: 12345). Output hidden. Press Ctrl+B to view.',
                            data: { pid: 12345, command: args.command }
                          }
                        }
                      }));
                    } else {
                      console.log(JSON.stringify({ decision: 'allow' }));
                    }
                  "`,
                },
              ],
            },
          ],
        },
      },
    });

    const run = await rig.runInteractive({ approvalMode: 'yolo' });

    // 1. Start a background process
    // We use a command that stays alive for a bit to ensure it shows up in lists
    await run.type(
      "Run 'sleep 10 && echo hello-from-background' in the background.",
    );
    await run.type('\r');

    // Wait for the model's canned response acknowledging the start
    await run.expectText('background', 30000);

    // 2. List background processes
    await run.type('List my background processes.');
    await run.type('\r');
    // Wait for the model's canned response showing the list
    await run.expectText('hello-from-background', 30000);

    // 3. Read the output
    await run.type('Read the output of that process.');
    await run.type('\r');
    // Wait for the model's canned response showing the output
    await run.expectText('hello-from-background', 30000);
  }, 60000);
});
