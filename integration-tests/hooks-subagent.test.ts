/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

describe('Hooks Subagent Integration', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    if (rig) {
      await rig.cleanup();
    }
  });

  describe('BeforeSubAgent Hooks', () => {
    it('should fire BeforeSubAgent hook when delegating to a subagent', async () => {
      await rig.setup(
        'should fire BeforeSubAgent hook when delegating to a subagent',
        {
          fakeResponsesPath: join(
            import.meta.dirname,
            'hooks-subagent.normal.responses',
          ),
        },
      );

      const hookScript = `
      const fs = require('fs');
      try {
        const input = fs.readFileSync(0, 'utf-8');
        const parsed = JSON.parse(input);
        
        const output = {
          decision: "allow",
          hookSpecificOutput: {
            hookEventName: "BeforeSubAgent",
            additionalContext: "BeforeSubAgent context injected"
          }
        };
        process.stdout.write(JSON.stringify(output));
        console.error('DEBUG: BeforeSubAgent hook received agent: ' + parsed.subagent_name);
      } catch (e) {
        console.error('Hook error:', e);
        process.exit(1);
      }
      `;

      const scriptPath = join(rig.testDir!, 'before_subagent_hook.cjs');
      writeFileSync(scriptPath, hookScript);

      await rig.setup(
        'should fire BeforeSubAgent hook when delegating to a subagent',
        {
          settings: {
            tools: {
              enableHooks: true,
            },
            hooks: {
              BeforeSubAgent: [
                {
                  hooks: [
                    {
                      type: 'command',
                      command: `node "${scriptPath}"`,
                      timeout: 10000,
                    },
                  ],
                },
              ],
            },
          },
        },
      );

      await rig.run({
        args: 'Investigate the codebase structure',
      });

      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();

      const hookLogs = rig.readHookLogs();
      const beforeSubAgentLog = hookLogs.find(
        (log) => log.hookCall.hook_event_name === 'BeforeSubAgent',
      );

      expect(beforeSubAgentLog).toBeDefined();
      expect(beforeSubAgentLog?.hookCall.exit_code).toBe(0);
      expect(beforeSubAgentLog?.hookCall.stdout).toContain(
        '"decision":"allow"',
      );
    });

    it('should block subagent execution when BeforeSubAgent hook returns block decision', async () => {
      await rig.setup(
        'should block subagent execution when BeforeSubAgent hook returns block decision',
        {
          fakeResponsesPath: join(
            import.meta.dirname,
            'hooks-subagent.block.responses',
          ),
          settings: {
            tools: {
              enableHooks: true,
            },
            hooks: {
              BeforeSubAgent: [
                {
                  hooks: [
                    {
                      type: 'command',
                      command:
                        "node -e \"console.log(JSON.stringify({decision: 'block', reason: 'Subagent blocked by security policy'}))\"",
                      timeout: 5000,
                    },
                  ],
                },
              ],
            },
          },
        },
      );

      const result = await rig.run({
        args: 'Investigate the codebase structure',
      });

      expect(result).toContain('Subagent blocked by security policy');

      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();
    });

    it('should allow modifying subagent inputs via BeforeSubAgent hook', async () => {
      await rig.setup(
        'should allow modifying subagent inputs via BeforeSubAgent hook',
        {
          fakeResponsesPath: join(
            import.meta.dirname,
            'hooks-subagent.normal.responses',
          ),
        },
      );

      const hookScript = `
      const fs = require('fs');
      try {
        const input = fs.readFileSync(0, 'utf-8');
        const parsed = JSON.parse(input);
        
        const modifiedInputs = { ...parsed.subagent_inputs };
        if (modifiedInputs.objective) {
          modifiedInputs.objective = modifiedInputs.objective + ' [MODIFIED BY HOOK]';
        }
        
        const output = {
          decision: "allow",
          hookSpecificOutput: {
            hookEventName: "BeforeSubAgent",
            subagent_inputs: modifiedInputs
          }
        };
        process.stdout.write(JSON.stringify(output));
      } catch (e) {
        console.error('Hook error:', e);
        process.stdout.write(JSON.stringify({decision: 'allow'}));
      }
      `;

      const scriptPath = join(rig.testDir!, 'modify_input_hook.cjs');
      writeFileSync(scriptPath, hookScript);

      await rig.setup(
        'should allow modifying subagent inputs via BeforeSubAgent hook',
        {
          settings: {
            tools: {
              enableHooks: true,
            },
            hooks: {
              BeforeSubAgent: [
                {
                  hooks: [
                    {
                      type: 'command',
                      command: `node "${scriptPath}"`,
                      timeout: 10000,
                    },
                  ],
                },
              ],
            },
          },
        },
      );

      await rig.run({
        args: 'Investigate the codebase structure',
      });

      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();
    });
  });

  describe('AfterSubAgent Hooks', () => {
    it('should fire AfterSubAgent hook after subagent completes', async () => {
      await rig.setup(
        'should fire AfterSubAgent hook after subagent completes',
        {
          fakeResponsesPath: join(
            import.meta.dirname,
            'hooks-subagent.normal.responses',
          ),
        },
      );

      const hookScript = `
      const fs = require('fs');
      try {
        const input = fs.readFileSync(0, 'utf-8');
        const parsed = JSON.parse(input);
        
        const output = {
          decision: "allow",
          hookSpecificOutput: {
            hookEventName: "AfterSubAgent",
            additionalContext: "AfterSubAgent: Subagent completed successfully"
          }
        };
        process.stdout.write(JSON.stringify(output));
        console.error('DEBUG: AfterSubAgent hook received output for: ' + parsed.subagent_name);
      } catch (e) {
        console.error('Hook error:', e);
        process.exit(1);
      }
      `;

      const scriptPath = join(rig.testDir!, 'after_subagent_hook.cjs');
      writeFileSync(scriptPath, hookScript);

      await rig.setup(
        'should fire AfterSubAgent hook after subagent completes',
        {
          settings: {
            tools: {
              enableHooks: true,
            },
            hooks: {
              AfterSubAgent: [
                {
                  hooks: [
                    {
                      type: 'command',
                      command: `node "${scriptPath}"`,
                      timeout: 10000,
                    },
                  ],
                },
              ],
            },
          },
        },
      );

      await rig.run({
        args: 'Investigate the codebase structure',
      });

      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();

      const hookLogs = rig.readHookLogs();
      const afterSubAgentLog = hookLogs.find(
        (log) => log.hookCall.hook_event_name === 'AfterSubAgent',
      );

      expect(afterSubAgentLog).toBeDefined();
      expect(afterSubAgentLog?.hookCall.exit_code).toBe(0);
    });

    it('should receive subagent output in AfterSubAgent hook', async () => {
      await rig.setup('should receive subagent output in AfterSubAgent hook', {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-subagent.normal.responses',
        ),
      });

      const hookScript = `
      const fs = require('fs');
      try {
        const input = fs.readFileSync(0, 'utf-8');
        const parsed = JSON.parse(input);
        
        if (!parsed.subagent_output) {
          console.error('ERROR: subagent_output missing from hook input');
          process.exit(1);
        }
        
        const output = {
          decision: "allow",
          hookSpecificOutput: {
            hookEventName: "AfterSubAgent",
            additionalContext: "Output received: " + JSON.stringify(parsed.subagent_output).substring(0, 50)
          }
        };
        process.stdout.write(JSON.stringify(output));
      } catch (e) {
        console.error('Hook error:', e);
        process.stdout.write(JSON.stringify({decision: 'allow'}));
      }
      `;

      const scriptPath = join(rig.testDir!, 'after_output_hook.cjs');
      writeFileSync(scriptPath, hookScript);

      await rig.setup('should receive subagent output in AfterSubAgent hook', {
        settings: {
          tools: {
            enableHooks: true,
          },
          hooks: {
            AfterSubAgent: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: `node "${scriptPath}"`,
                    timeout: 10000,
                  },
                ],
              },
            ],
          },
        },
      });

      await rig.run({
        args: 'Investigate the codebase structure',
      });

      const hookLogs = rig.readHookLogs();
      const afterSubAgentLog = hookLogs.find(
        (log) => log.hookCall.hook_event_name === 'AfterSubAgent',
      );

      expect(afterSubAgentLog).toBeDefined();
      expect(afterSubAgentLog?.hookCall.exit_code).toBe(0);
    });
  });

  describe('Combined BeforeSubAgent and AfterSubAgent Hooks', () => {
    it('should fire both BeforeSubAgent and AfterSubAgent hooks in sequence', async () => {
      await rig.setup(
        'should fire both BeforeSubAgent and AfterSubAgent hooks in sequence',
        {
          fakeResponsesPath: join(
            import.meta.dirname,
            'hooks-subagent.normal.responses',
          ),
          settings: {
            tools: {
              enableHooks: true,
            },
            hooks: {
              BeforeSubAgent: [
                {
                  hooks: [
                    {
                      type: 'command',
                      command:
                        "node -e \"console.log(JSON.stringify({decision: 'allow'})); console.error('BeforeSubAgent fired')\"",
                      timeout: 5000,
                    },
                  ],
                },
              ],
              AfterSubAgent: [
                {
                  hooks: [
                    {
                      type: 'command',
                      command:
                        "node -e \"console.log(JSON.stringify({decision: 'allow'})); console.error('AfterSubAgent fired')\"",
                      timeout: 5000,
                    },
                  ],
                },
              ],
            },
          },
        },
      );

      await rig.run({
        args: 'Investigate the codebase structure',
      });

      const hookLogs = rig.readHookLogs();
      const beforeSubAgentLogs = hookLogs.filter(
        (log) => log.hookCall.hook_event_name === 'BeforeSubAgent',
      );
      const afterSubAgentLogs = hookLogs.filter(
        (log) => log.hookCall.hook_event_name === 'AfterSubAgent',
      );

      expect(beforeSubAgentLogs.length).toBeGreaterThanOrEqual(1);
      expect(afterSubAgentLogs.length).toBeGreaterThanOrEqual(1);

      expect(beforeSubAgentLogs[0]?.hookCall.stderr).toContain(
        'BeforeSubAgent fired',
      );
      expect(afterSubAgentLogs[0]?.hookCall.stderr).toContain(
        'AfterSubAgent fired',
      );
    });
  });
});
