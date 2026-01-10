/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

describe('Hooks Agent Flow', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    if (rig) {
      await rig.cleanup();
    }
  });

  describe('BeforeAgent Hooks', () => {
    it('should inject additional context via BeforeAgent hook', async () => {
      await rig.setup('should inject additional context via BeforeAgent hook', {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-agent-flow.responses',
        ),
      });

      const hookScript = `
      try {
        const output = {
          decision: "allow",
          hookSpecificOutput: {
            hookEventName: "BeforeAgent",
            additionalContext: "SYSTEM INSTRUCTION: This is injected context."
          }
        };
        process.stdout.write(JSON.stringify(output));
      } catch (e) {
        console.error('Failed to write stdout:', e);
        process.exit(1);
      }
      console.error('DEBUG: BeforeAgent hook executed');
      `;

      const scriptPath = join(rig.testDir!, 'before_agent_context.cjs');
      writeFileSync(scriptPath, hookScript);

      await rig.setup('should inject additional context via BeforeAgent hook', {
        settings: {
          hooks: {
            enabled: true,
            BeforeAgent: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: `node "${scriptPath}"`,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      });

      await rig.run({ args: 'Hello test' });

      // Verify hook execution and telemetry
      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();

      const hookLogs = rig.readHookLogs();
      const beforeAgentLog = hookLogs.find(
        (log) => log.hookCall.hook_event_name === 'BeforeAgent',
      );

      expect(beforeAgentLog).toBeDefined();
      expect(beforeAgentLog?.hookCall.stdout).toContain('injected context');
      expect(beforeAgentLog?.hookCall.stdout).toContain('"decision":"allow"');
      expect(beforeAgentLog?.hookCall.stdout).toContain(
        'SYSTEM INSTRUCTION: This is injected context.',
      );
    });
  });

  describe('AfterAgent Hooks', () => {
    it('should receive prompt and response in AfterAgent hook', async () => {
      await rig.setup('should receive prompt and response in AfterAgent hook', {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-agent-flow.responses',
        ),
      });

      const hookScript = `
      const fs = require('fs');
      try {
        const input = fs.readFileSync(0, 'utf-8');
        console.error('DEBUG: AfterAgent hook input received');
        process.stdout.write("Received Input: " + input);
      } catch (err) {
        console.error('Hook Failed:', err);
        process.exit(1);
      }
      `;

      const scriptPath = join(rig.testDir!, 'after_agent_verify.cjs');
      writeFileSync(scriptPath, hookScript);

      await rig.setup('should receive prompt and response in AfterAgent hook', {
        settings: {
          hooks: {
            enabled: true,
            AfterAgent: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: `node "${scriptPath}"`,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      });

      await rig.run({ args: 'Hello validation' });

      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();

      const hookLogs = rig.readHookLogs();
      const afterAgentLog = hookLogs.find(
        (log) => log.hookCall.hook_event_name === 'AfterAgent',
      );

      expect(afterAgentLog).toBeDefined();
      // Verify the hook stdout contains the input we echoed which proves the
      // hook received the prompt and response
      expect(afterAgentLog?.hookCall.stdout).toContain('Received Input');
      expect(afterAgentLog?.hookCall.stdout).toContain('Hello validation');
      // The fake response contains "Hello World"
      expect(afterAgentLog?.hookCall.stdout).toContain('Hello World');
    });
  });

  describe('Multi-step Loops', () => {
    it('should fire BeforeAgent and AfterAgent exactly once per turn despite tool calls', async () => {
      await rig.setup(
        'should fire BeforeAgent and AfterAgent exactly once per turn despite tool calls',
        {
          fakeResponsesPath: join(
            import.meta.dirname,
            'hooks-agent-flow-multistep.responses',
          ),
          settings: {
            hooks: {
              enabled: true,
              BeforeAgent: [
                {
                  hooks: [
                    {
                      type: 'command',
                      command: `node -e "console.log('BeforeAgent Fired')"`,
                      timeout: 5000,
                    },
                  ],
                },
              ],
              AfterAgent: [
                {
                  hooks: [
                    {
                      type: 'command',
                      command: `node -e "console.log('AfterAgent Fired')"`,
                      timeout: 5000,
                    },
                  ],
                },
              ],
            },
          },
        },
      );

      await rig.run({ args: 'Do a multi-step task' });

      const hookLogs = rig.readHookLogs();
      const beforeAgentLogs = hookLogs.filter(
        (log) => log.hookCall.hook_event_name === 'BeforeAgent',
      );
      const afterAgentLogs = hookLogs.filter(
        (log) => log.hookCall.hook_event_name === 'AfterAgent',
      );

      expect(beforeAgentLogs).toHaveLength(1);

      expect(afterAgentLogs).toHaveLength(1);

      const afterAgentLog = afterAgentLogs[0];
      expect(afterAgentLog).toBeDefined();
      expect(afterAgentLog?.hookCall.stdout).toContain('AfterAgent Fired');
    });
  });
});
