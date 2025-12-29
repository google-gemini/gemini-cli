/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

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
    // Create a mock response file
    // We need a fake response that the model would produce
    await rig.setup(
      'should provide the final model response to AfterAgent hooks',
      {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-system.before-agent.responses', // Reusing an existing response set or creating a minimal one
        ),
      },
    );

    // Create a hook script that logs the prompt_response to stdout (which is captured)
    // We'll also echo it in a structured way we can parse
    const hookScript = `#!/bin/bash
# Read input from stdin
input=$(cat)

# Extract prompt_response using grep/sed/awk
# We extract the value associated with "prompt_response" key
# The sed commands remove the key and the surrounding quotes
response=$(echo "$input" | grep -o '"prompt_response":"[^"]*"' | sed 's/"prompt_response":"//' | sed 's/"$//')

# Echo a structured output that we can assert on in the test result
# We escape the quotes for JSON
echo "{\\"decision\\": \\"allow\\", \\"systemMessage\\": \\"Hook received response: $response\\"}"
`;

    const scriptPath = join(rig.testDir!, 'after_agent_hook.sh');
    writeFileSync(scriptPath, hookScript);

    // Make executable
    const { execSync } = await import('node:child_process');
    execSync(`chmod +x "${scriptPath}"`);

    await rig.setup(
      'should provide the final model response to AfterAgent hooks',
      {
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
                    command: scriptPath,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      },
    );

    const result = await rig.run({ args: 'Hello' });

    // Wait for hook telemetry to be flushed
    // Note: This relies on the system successfully generating telemetry for the hook call
    // If AfterAgent doesn't fire, this will time out
    await rig.waitForTelemetryEvent('hook_call');

    // The hook should have executed and printed the system message
    // Note: The actual response text depends on the 'hooks-system.before-agent.responses' content
    // But we should at least see the prefix we added
    expect(result).toContain('Hook received response:');

    // Verify the hook executed via telemetry
    const hookLogs = rig.readHookLogs();
    const afterAgentLog = hookLogs.find(
      (log) => log.hookCall.hook_event_name === 'AfterAgent',
    );

    expect(afterAgentLog).toBeDefined();
    expect(afterAgentLog?.hookCall.hook_name).toBe(scriptPath);
    expect(afterAgentLog?.hookCall.exit_code).toBe(0);

    // Verify the input contained prompt_response
    // We can inspect the hook_input in the telemetry log
    const hookInput =
      typeof afterAgentLog!.hookCall.hook_input === 'string'
        ? JSON.parse(afterAgentLog!.hookCall.hook_input)
        : afterAgentLog!.hookCall.hook_input;

    expect(hookInput).toHaveProperty('prompt_response');
    expect(typeof hookInput.prompt_response).toBe('string');
    expect(hookInput.prompt_response.length).toBeGreaterThan(0);
  });
});
