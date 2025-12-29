/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, poll } from './test-helper.js';
import { join } from 'node:path';

describe('AfterAgent Hook Integration', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    if (rig) {
      await rig.cleanup();
    }
  });

  it('should provide the final model response to AfterAgent hooks', async () => {
    // We use a node script for robust JSON parsing
    const hookScriptName = 'after_agent_hook.js';
    const hookScriptContent = `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
try {
  // Read from stdin
  const input = JSON.parse(readFileSync(0, 'utf-8'));
  const response = input.prompt_response || '';
  const output = {
    decision: 'allow',
    systemMessage: \`Hook received response: \${response}\`
  };
  console.log(JSON.stringify(output));
} catch (e) {
  console.error(\`Error parsing hook input: \${e}\`);
  process.exit(1);
}
`;

    // Configure the test rig in a single step
    // We refer to the hook script by relative path, which will be resolved
    // relative to the project root (testDir) when executed.
    await rig.setup(
      'should provide the final model response to AfterAgent hooks',
      {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-system.before-agent.responses', // Reusing an existing response set
        ),
        settings: {
          tools: {
            enableHooks: true,
          },
          hooks: {
            AfterAgent: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: `./${hookScriptName}`,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      },
    );

    // Create the hook script in the test directory
    const scriptPath = rig.createFile(hookScriptName, hookScriptContent);

    // Make executable
    const { execSync } = await import('node:child_process');
    execSync(`chmod +x "${scriptPath}"`);

    const result = await rig.run({ args: 'Hello' });

    // Wait for hook telemetry to be flushed
    await rig.waitForTelemetryEvent('hook_call');

    // The hook should have executed and printed the system message
    expect(result).toContain('Hook received response:');

    // Verify the hook executed via telemetry
    const hookLogs = rig.readHookLogs();
    const afterAgentLog = hookLogs.find(
      (log) => log.hookCall.hook_event_name === 'AfterAgent',
    );

    expect(afterAgentLog).toBeDefined();
    // The hook name in logs might be absolute or relative depending on how it's executed
    // We just check it ends with the script name
    expect(afterAgentLog?.hookCall.hook_name).toContain(hookScriptName);
    expect(afterAgentLog?.hookCall.exit_code).toBe(0);

    // Verify the input contained prompt_response
    const hookInput =
      typeof afterAgentLog!.hookCall.hook_input === 'string'
        ? JSON.parse(afterAgentLog!.hookCall.hook_input)
        : afterAgentLog!.hookCall.hook_input;

    expect(hookInput).toHaveProperty('prompt_response');
    expect(typeof hookInput.prompt_response).toBe('string');
    expect(hookInput.prompt_response.length).toBeGreaterThan(0);
  });

  it('should provide the final model response to AfterAgent hooks in interactive mode', async () => {
    // We use a node script for robust JSON parsing
    const hookScriptName = 'after_agent_hook_interactive.js';
    const hookScriptContent = `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
try {
  // Read from stdin
  const input = JSON.parse(readFileSync(0, 'utf-8'));
  const response = input.prompt_response || '';
  const output = {
    decision: 'allow',
    systemMessage: \`Interactive hook received response: \${response}\`
  };
  console.log(JSON.stringify(output));
} catch (e) {
  console.error(\`Error parsing hook input: \${e}\`);
  process.exit(1);
}
`;

    await rig.setup(
      'should provide the final model response to AfterAgent hooks in interactive mode',
      {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-system.after-agent-interactive.responses',
        ),
        settings: {
          tools: {
            enableHooks: true,
          },
          hooks: {
            AfterAgent: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: `./${hookScriptName}`,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      },
    );

    // Create the hook script in the test directory
    const scriptPath = rig.createFile(hookScriptName, hookScriptContent);

    // Make executable
    const { execSync } = await import('node:child_process');
    execSync(`chmod +x "${scriptPath}"`);

    const run = await rig.runInteractive();

    // Send a prompt
    await run.type('Hello');
    await run.type('\r');

    // Wait for response
    await run.expectText('Response 1', 10000);

    // Send second prompt
    await run.type('Hello again');
    await run.type('\r');

    // Wait for response
    await run.expectText('Response 2', 10000);

    // Wait for 2 hook events
    await poll(
      () => {
        const hookLogs = rig.readHookLogs();
        return (
          hookLogs.filter(
            (log) => log.hookCall.hook_event_name === 'AfterAgent',
          ).length >= 2
        );
      },
      15000,
      500,
    );

    // Verify the hook executed via telemetry
    const hookLogs = rig.readHookLogs();
    const afterAgentLogs = hookLogs.filter(
      (log) => log.hookCall.hook_event_name === 'AfterAgent',
    );

    expect(afterAgentLogs.length).toBeGreaterThanOrEqual(2);

    const lastLog = afterAgentLogs[afterAgentLogs.length - 1];
    expect(lastLog).toBeDefined();
    expect(lastLog?.hookCall.hook_name).toContain(hookScriptName);
    expect(lastLog?.hookCall.exit_code).toBe(0);

    // Verify the input contained prompt_response
    const hookInput =
      typeof lastLog!.hookCall.hook_input === 'string'
        ? JSON.parse(lastLog!.hookCall.hook_input)
        : lastLog!.hookCall.hook_input;

    expect(hookInput).toHaveProperty('prompt_response');
    expect(typeof hookInput.prompt_response).toBe('string');
    expect(hookInput.prompt_response.length).toBeGreaterThan(0);
  });
});
