/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

describe('Hooks System - Input Override', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    if (rig) {
      await rig.cleanup();
    }
  });

  it('should override tool input parameters via BeforeTool hook', async () => {
    // 1. First setup to get the test directory and prepare the hook script
    // We do a partial setup just to get the directory, but we'll do the full setup
    // with settings and fake responses in one go later.
    await rig.setup(
      'should override tool input parameters via BeforeTool hook',
    );

    // Create a hook script that overrides the tool input
    const hookScript = `#!/bin/bash
echo '{
  "decision": "allow",
  "hookSpecificOutput": {
    "hookEventName": "BeforeTool",
    "tool_input": {
      "file_path": "modified.txt",
      "content": "modified content"
    }
  }
}'`;

    const scriptPath = join(rig.testDir!, 'input_override_hook.sh');
    writeFileSync(scriptPath, hookScript);

    // Make executable
    const { execSync } = await import('node:child_process');
    execSync(`chmod +x "${scriptPath}"`);

    // 2. Full setup with settings and fake responses
    await rig.setup(
      'should override tool input parameters via BeforeTool hook',
      {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-system.input-modification.responses',
        ),
        settings: {
          tools: {
            enableHooks: true,
          },
          hooks: {
            BeforeTool: [
              {
                matcher: 'write_file',
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

    // Run the agent. The fake response will attempt to call write_file with
    // file_path="original.txt" and content="original content"
    await rig.run({
      args: 'Create a file called original.txt with content "original content"',
    });

    // 1. Verify that 'modified.txt' was created with 'modified content' (Override successful)
    const modifiedContent = rig.readFile('modified.txt');
    expect(modifiedContent).toBe('modified content');

    // 2. Verify that 'original.txt' was NOT created (Override replaced original)
    let originalExists = false;
    try {
      rig.readFile('original.txt');
      originalExists = true;
    } catch {
      originalExists = false;
    }
    expect(originalExists).toBe(false);

    // 3. Verify hook telemetry
    const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
    expect(hookTelemetryFound).toBeTruthy();

    const hookLogs = rig.readHookLogs();
    expect(hookLogs.length).toBe(1);
    expect(hookLogs[0].hookCall.hook_name).toBe(scriptPath);

    // 4. Verify that the agent didn't try to work-around the hook input change
    // It should have accepted the tool output and not retried with the original or different parameters.
    const toolLogs = rig.readToolLogs();
    expect(toolLogs.length).toBe(1);
    expect(toolLogs[0].toolRequest.name).toBe('write_file');
    // The tool log should reflect the MODIFIED input because that's what was actually executed
    expect(JSON.parse(toolLogs[0].toolRequest.args).file_path).toBe(
      'modified.txt',
    );
  });
});
