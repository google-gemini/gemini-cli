/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TestRig,
  createPlatformHookScript,
  createValidatingHookScript,
  createFailingHookScript,
} from './test-helper.js';
import { join } from 'node:path';

describe('Hooks System Integration', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    if (rig) {
      await rig.cleanup();
    }
  });

  describe('Command Hooks - Blocking Behavior', () => {
    it('should block tool execution when hook returns block decision', async () => {
      await rig.setup(
        'should block tool execution when hook returns block decision',
        {
          fakeResponsesPath: join(
            import.meta.dirname,
            'hooks-system.block-tool.responses',
          ),
          settings: {
            tools: {
              enableHooks: true,
            },
            hooks: {
              BeforeTool: [
                {
                  matcher: 'write_file',
                  sequential: true,
                  hooks: [
                    {
                      type: 'command',
                      command:
                        'echo "{\\"decision\\": \\"block\\", \\"reason\\": \\"File writing blocked by security policy\\"}"',
                      timeout: 5000,
                    },
                  ],
                },
              ],
            },
          },
        },
      );

      const prompt = 'Create a file called test.txt with content "Hello World"';
      const result = await rig.run(prompt);

      // The hook should block the write_file tool
      const toolLogs = rig.readToolLogs();
      const writeFileCalls = toolLogs.filter(
        (t) =>
          t.toolRequest.name === 'write_file' && t.toolRequest.success === true,
      );

      // Tool should not be called due to blocking hook
      expect(writeFileCalls).toHaveLength(0);

      // Result should mention the blocking reason
      expect(result).toContain('File writing blocked by security policy');

      // Should generate hook telemetry
      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();
    });

    it('should allow tool execution when hook returns allow decision', async () => {
      await rig.setup(
        'should allow tool execution when hook returns allow decision',
        {
          fakeResponsesPath: join(
            import.meta.dirname,
            'hooks-system.allow-tool.responses',
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
                      command:
                        'echo "{\\"decision\\": \\"allow\\", \\"reason\\": \\"File writing approved\\"}"',
                      timeout: 5000,
                    },
                  ],
                },
              ],
            },
          },
        },
      );

      const prompt =
        'Create a file called approved.txt with content "Approved content"';
      await rig.run(prompt);

      // The hook should allow the write_file tool
      const foundWriteFile = await rig.waitForToolCall('write_file');
      expect(foundWriteFile).toBeTruthy();

      // File should be created
      const fileContent = rig.readFile('approved.txt');
      expect(fileContent).toContain('Approved content');

      // Should generate hook telemetry
      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();
    });
  });

  describe('Command Hooks - Additional Context', () => {
    it('should add additional context from AfterTool hooks', async () => {
      const command =
        'echo "{\\"hookSpecificOutput\\": {\\"hookEventName\\": \\"AfterTool\\", \\"additionalContext\\": \\"Security scan: File content appears safe\\"}}"';
      await rig.setup('should add additional context from AfterTool hooks', {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-system.after-tool-context.responses',
        ),
        settings: {
          tools: {
            enableHooks: true,
          },
          hooks: {
            AfterTool: [
              {
                matcher: 'read_file',
                hooks: [
                  {
                    type: 'command',
                    command: command,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      });

      // Create a test file to read
      rig.createFile('test-file.txt', 'This is test content');

      const prompt =
        'Read the contents of test-file.txt and tell me what it contains';
      await rig.run(prompt);

      // Should find read_file tool call
      const foundReadFile = await rig.waitForToolCall('read_file');
      expect(foundReadFile).toBeTruthy();

      // Should generate hook telemetry
      const hookTelemetryFound = rig.readHookLogs();
      expect(hookTelemetryFound.length).toBeGreaterThan(0);
      expect(hookTelemetryFound[0].hookCall.hook_event_name).toBe('AfterTool');
      expect(hookTelemetryFound[0].hookCall.hook_name).toBe(command);
      expect(hookTelemetryFound[0].hookCall.hook_input).toBeDefined();
      expect(hookTelemetryFound[0].hookCall.hook_output).toBeDefined();
      expect(hookTelemetryFound[0].hookCall.exit_code).toBe(0);
      expect(hookTelemetryFound[0].hookCall.stdout).toBeDefined();
      expect(hookTelemetryFound[0].hookCall.stderr).toBeDefined();
    });
  });

  describe('BeforeModel Hooks - LLM Request Modification', () => {
    it('should modify LLM requests with BeforeModel hooks', async () => {
      // Create a hook script that replaces the LLM request with a modified version
      // Note: Providing messages in the hook output REPLACES the entire conversation
      await rig.setup('should modify LLM requests with BeforeModel hooks', {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-system.before-model.responses',
        ),
      });
      const hookCommand = createPlatformHookScript(
        `{
  "decision": "allow",
  "hookSpecificOutput": {
    "hookEventName": "BeforeModel",
    "llm_request": {
      "messages": [
        {
          "role": "user",
          "content": "Please respond with exactly: The security hook modified this request successfully."
        }
      ]
    }
  }
}`,
        rig.testDir!,
        'before_model_hook',
      );

      await rig.setup('should modify LLM requests with BeforeModel hooks', {
        settings: {
          tools: {
            enableHooks: true,
          },
          hooks: {
            BeforeModel: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: hookCommand,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      });

      const prompt = 'Tell me a story';
      const result = await rig.run(prompt);

      // The hook should have replaced the request entirely
      // Verify that the model responded to the modified request, not the original
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      // The response should contain the expected text from the modified request
      expect(result.toLowerCase()).toContain('security hook modified');

      // Should generate hook telemetry

      // Should generate hook telemetry
      const hookTelemetryFound = rig.readHookLogs();
      expect(hookTelemetryFound.length).toBeGreaterThan(0);
      expect(hookTelemetryFound[0].hookCall.hook_event_name).toBe(
        'BeforeModel',
      );
      expect(hookTelemetryFound[0].hookCall.hook_name).toBe(hookCommand);
      expect(hookTelemetryFound[0].hookCall.hook_input).toBeDefined();
      expect(hookTelemetryFound[0].hookCall.hook_output).toBeDefined();
      expect(hookTelemetryFound[0].hookCall.exit_code).toBe(0);
      expect(hookTelemetryFound[0].hookCall.stdout).toBeDefined();
      expect(hookTelemetryFound[0].hookCall.stderr).toBeDefined();
    });
  });

  describe('AfterModel Hooks - LLM Response Modification', () => {
    it('should modify LLM responses with AfterModel hooks', async () => {
      await rig.setup('should modify LLM responses with AfterModel hooks', {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-system.after-model.responses',
        ),
      });
      // Create a platform-appropriate hook script that modifies the LLM response
      const hookCommand = createPlatformHookScript(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'AfterModel',
            llm_response: {
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [
                      '[FILTERED] Response has been filtered for security compliance.',
                    ],
                  },
                  finishReason: 'STOP',
                },
              ],
            },
          },
        }),
        rig.testDir!,
        'after_model_hook',
      );

      await rig.setup('should modify LLM responses with AfterModel hooks', {
        settings: {
          tools: {
            enableHooks: true,
          },
          hooks: {
            AfterModel: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: hookCommand,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      });

      const prompt = 'What is 2 + 2?';
      const result = await rig.run(prompt);

      // The hook should have replaced the model response
      expect(result).toContain(
        '[FILTERED] Response has been filtered for security compliance',
      );

      // Should generate hook telemetry
      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();
    });
  });

  describe('BeforeToolSelection Hooks - Tool Configuration', () => {
    it('should modify tool selection with BeforeToolSelection hooks', async () => {
      await rig.setup(
        'should modify tool selection with BeforeToolSelection hooks',
        {
          fakeResponsesPath: join(
            import.meta.dirname,
            'hooks-system.before-tool-selection.responses',
          ),
        },
      );
      // Create a platform-appropriate hook script that restricts available tools
      const hookCommand = createPlatformHookScript(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'BeforeToolSelection',
            toolConfig: {
              mode: 'ANY',
              allowedFunctionNames: ['read_file', 'run_shell_command'],
            },
          },
        }),
        rig.testDir!,
        'before_tool_selection_hook',
      );

      await rig.setup(
        'should modify tool selection with BeforeToolSelection hooks',
        {
          settings: {
            debugMode: true,
            tools: {
              enableHooks: true,
            },
            hooks: {
              BeforeToolSelection: [
                {
                  hooks: [
                    {
                      type: 'command',
                      command: hookCommand,
                      timeout: 5000,
                    },
                  ],
                },
              ],
            },
          },
        },
      );

      // Create a test file
      rig.createFile('new_file_data.txt', 'test data');

      const prompt =
        'Check the content of new_file_data.txt, after that run echo command to see the content';
      await rig.run(prompt);

      // Should use read_file (allowed) but not run_shell_command (not in allowed list)
      const foundReadFile = await rig.waitForToolCall('read_file');
      expect(foundReadFile).toBeTruthy();

      // Should generate hook telemetry indicating the hook was called
      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();

      // Verify the hook was called for BeforeToolSelection event
      const hookLogs = rig.readHookLogs();
      const beforeToolSelectionHook = hookLogs.find(
        (log) => log.hookCall.hook_event_name === 'BeforeToolSelection',
      );
      expect(beforeToolSelectionHook).toBeDefined();
      expect(beforeToolSelectionHook?.hookCall.success).toBe(true);
    });
  });

  describe('BeforeAgent Hooks - Prompt Augmentation', () => {
    it('should augment prompts with BeforeAgent hooks', async () => {
      await rig.setup('should augment prompts with BeforeAgent hooks', {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-system.before-agent.responses',
        ),
      });
      // Create a platform-appropriate hook script that adds context to the prompt
      const hookCommand = createPlatformHookScript(
        JSON.stringify({
          decision: 'allow',
          hookSpecificOutput: {
            hookEventName: 'BeforeAgent',
            additionalContext:
              'SYSTEM INSTRUCTION: You are in a secure environment. Always mention security compliance in your responses.',
          },
        }),
        rig.testDir!,
        'before_agent_hook',
      );

      await rig.setup('should augment prompts with BeforeAgent hooks', {
        settings: {
          tools: {
            enableHooks: true,
          },
          hooks: {
            BeforeAgent: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: hookCommand,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      });

      const prompt = 'Hello, how are you?';
      const result = await rig.run(prompt);

      // The hook should have added security context, which should influence the response
      expect(result).toContain('security');

      // Should generate hook telemetry
      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();
    });
  });

  describe.skip('Notification Hooks - Permission Handling', () => {
    it('should handle notification hooks for tool permissions', async () => {
      await rig.setup('should handle notification hooks for tool permissions');
      // Create a platform-appropriate hook script that logs notification events
      const hookCommand = createPlatformHookScript(
        JSON.stringify({
          suppressOutput: false,
          systemMessage: 'Permission request logged by security hook',
        }),
        rig.testDir!,
        'notification_hook',
      );

      await rig.setup('should handle notification hooks for tool permissions', {
        settings: {
          // Configure tools to enable hooks and require confirmation to trigger notifications
          tools: {
            enableHooks: true,
            confirmationRequired: ['run_shell_command'],
          },
          hooks: {
            Notification: [
              {
                matcher: 'ToolPermission',
                hooks: [
                  {
                    type: 'command',
                    command: hookCommand,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      });

      const prompt =
        'Run the command "echo test" (this should trigger a permission prompt)';

      // Use stdin to automatically approve the permission
      await rig.run({
        prompt,
        stdin: 'y\n', // Approve the permission
      });

      // Should find the shell command execution
      const foundShellCommand = await rig.waitForToolCall('run_shell_command');
      expect(foundShellCommand).toBeTruthy();

      // Should generate hook telemetry
      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();
    });
  });

  describe('Sequential Hook Execution', () => {
    // Note: This test checks telemetry for hook context in API requests,
    // which behaves differently with mocked responses. Keeping real LLM calls.
    it('should execute hooks sequentially when configured', async () => {
      await rig.setup('should execute hooks sequentially when configured');
      // Create two platform-appropriate hooks that modify the input sequentially
      const hook1Command = createPlatformHookScript(
        JSON.stringify({
          decision: 'allow',
          hookSpecificOutput: {
            hookEventName: 'BeforeAgent',
            additionalContext: 'Step 1: Initial validation passed.',
          },
        }),
        rig.testDir!,
        'sequential_hook1',
      );

      const hook2Command = createPlatformHookScript(
        JSON.stringify({
          decision: 'allow',
          hookSpecificOutput: {
            hookEventName: 'BeforeAgent',
            additionalContext: 'Step 2: Security check completed.',
          },
        }),
        rig.testDir!,
        'sequential_hook2',
      );

      await rig.setup('should execute hooks sequentially when configured', {
        settings: {
          tools: {
            enableHooks: true,
          },
          hooks: {
            BeforeAgent: [
              {
                sequential: true,
                hooks: [
                  {
                    type: 'command',
                    command: hook1Command,
                    timeout: 5000,
                  },
                  {
                    type: 'command',
                    command: hook2Command,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      });

      const prompt = 'Hello, please help me with a task';
      await rig.run(prompt);

      // Should generate hook telemetry
      let hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();
      hookTelemetryFound = await rig.waitForTelemetryEvent('api_request');
      const apiRequests = rig.readAllApiRequest();
      const apiRequestsTexts = apiRequests
        ?.filter(
          (request) =>
            'attributes' in request &&
            typeof request['attributes'] === 'object' &&
            request['attributes'] !== null &&
            'request_text' in request['attributes'] &&
            typeof request['attributes']['request_text'] === 'string',
        )
        .map((request) => request['attributes']['request_text']);
      expect(apiRequestsTexts).toBeDefined();
      let hasBeforeAgentHookContext = false;
      let hasAfterToolHookContext = false;
      for (const requestText of apiRequestsTexts) {
        if (requestText.includes('Step 1: Initial validation passed')) {
          hasBeforeAgentHookContext = true;
        }
        if (requestText.includes('Step 2: Security check completed')) {
          hasAfterToolHookContext = true;
        }
      }
      expect(hasBeforeAgentHookContext).toBeTruthy();
      expect(hasAfterToolHookContext).toBeTruthy();
    });
  });

  describe('Hook Input/Output Validation', () => {
    it('should provide correct input format to hooks', async () => {
      await rig.setup('should provide correct input format to hooks', {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-system.input-validation.responses',
        ),
      });
      // Create a platform-appropriate hook script that validates the input format
      const hookCommand = createValidatingHookScript(
        [
          'session_id',
          'cwd',
          'hook_event_name',
          'timestamp',
          'tool_name',
          'tool_input',
        ],
        rig.testDir!,
        'input_validation_hook',
      );

      await rig.setup('should provide correct input format to hooks', {
        settings: {
          tools: {
            enableHooks: true,
          },
          hooks: {
            BeforeTool: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: hookCommand,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      });

      const prompt = 'Create a file called input-test.txt with content "test"';
      await rig.run(prompt);

      // Hook should validate input format successfully
      const foundWriteFile = await rig.waitForToolCall('write_file');
      expect(foundWriteFile).toBeTruthy();

      // Check that the file was created (hook allowed it)
      const fileContent = rig.readFile('input-test.txt');
      expect(fileContent).toContain('test');

      // Should generate hook telemetry
      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();
    });
  });

  describe('Multiple Event Types', () => {
    // Note: This test checks telemetry for hook context in API requests,
    // which behaves differently with mocked responses. Keeping real LLM calls.
    it('should handle hooks for all major event types', async () => {
      await rig.setup('should handle hooks for all major event types');
      // Create platform-appropriate hook scripts
      const beforeToolCommand = createPlatformHookScript(
        '{"decision": "allow", "systemMessage": "BeforeTool: File operation logged"}',
        rig.testDir!,
        'before_tool',
      );

      const afterToolCommand = createPlatformHookScript(
        '{"hookSpecificOutput": {"hookEventName": "AfterTool", "additionalContext": "AfterTool: Operation completed successfully"}}',
        rig.testDir!,
        'after_tool',
      );

      const beforeAgentCommand = createPlatformHookScript(
        '{"decision": "allow", "hookSpecificOutput": {"hookEventName": "BeforeAgent", "additionalContext": "BeforeAgent: User request processed"}}',
        rig.testDir!,
        'before_agent',
      );

      await rig.setup('should handle hooks for all major event types', {
        settings: {
          tools: {
            enableHooks: true,
          },
          hooks: {
            BeforeAgent: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: beforeAgentCommand,
                    timeout: 5000,
                  },
                ],
              },
            ],
            BeforeTool: [
              {
                matcher: 'write_file',
                hooks: [
                  {
                    type: 'command',
                    command: beforeToolCommand,
                    timeout: 5000,
                  },
                ],
              },
            ],
            AfterTool: [
              {
                matcher: 'write_file',
                hooks: [
                  {
                    type: 'command',
                    command: afterToolCommand,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      });

      const prompt =
        'Create a file called multi-event-test.txt with content ' +
        '"testing multiple events", and then please reply with ' +
        'everything I say just after this:"';
      const result = await rig.run(prompt);

      // Should execute write_file tool
      const foundWriteFile = await rig.waitForToolCall('write_file');
      expect(foundWriteFile).toBeTruthy();

      // File should be created
      const fileContent = rig.readFile('multi-event-test.txt');
      expect(fileContent).toContain('testing multiple events');

      // Result should contain context from all hooks
      expect(result).toContain('BeforeTool: File operation logged');

      // Should generate hook telemetry
      let hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();
      hookTelemetryFound = await rig.waitForTelemetryEvent('api_request');
      const apiRequests = rig.readAllApiRequest();
      const apiRequestsTexts = apiRequests
        ?.filter(
          (request) =>
            'attributes' in request &&
            typeof request['attributes'] === 'object' &&
            request['attributes'] !== null &&
            'request_text' in request['attributes'] &&
            typeof request['attributes']['request_text'] === 'string',
        )
        .map((request) => request['attributes']['request_text']);
      expect(apiRequestsTexts).toBeDefined();
      let hasBeforeAgentHookContext = false;
      let hasAfterToolHookContext = false;
      for (const requestText of apiRequestsTexts) {
        if (requestText.includes('BeforeAgent: User request processed')) {
          hasBeforeAgentHookContext = true;
        }
        if (
          requestText.includes('AfterTool: Operation completed successfully')
        ) {
          hasAfterToolHookContext = true;
        }
      }
      expect(hasBeforeAgentHookContext).toBeTruthy();
      expect(hasAfterToolHookContext).toBeTruthy();
    });
  });

  describe('Hook Error Handling', () => {
    it('should handle hook failures gracefully', async () => {
      await rig.setup('should handle hook failures gracefully', {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-system.error-handling.responses',
        ),
      });
      // Create platform-appropriate hook scripts - one that fails and one that works
      const failingHookCommand = createFailingHookScript(
        'Hook encountered an error',
        rig.testDir!,
        'failing_hook',
      );

      const workingHookCommand = createPlatformHookScript(
        JSON.stringify({
          decision: 'allow',
          reason: 'Working hook succeeded',
        }),
        rig.testDir!,
        'working_hook',
      );

      await rig.setup('should handle hook failures gracefully', {
        settings: {
          tools: {
            enableHooks: true,
          },
          hooks: {
            BeforeTool: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: failingHookCommand,
                    timeout: 5000,
                  },
                  {
                    type: 'command',
                    command: workingHookCommand,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      });

      const prompt =
        'Create a file called error-test.txt with content "testing error handling"';
      await rig.run(prompt);

      // Despite one hook failing, the working hook should still allow the operation
      const foundWriteFile = await rig.waitForToolCall('write_file');
      expect(foundWriteFile).toBeTruthy();

      // File should be created
      const fileContent = rig.readFile('error-test.txt');
      expect(fileContent).toContain('testing error handling');

      // Should generate hook telemetry
      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();
    });
  });

  describe('Hook Telemetry and Observability', () => {
    it('should generate telemetry events for hook executions', async () => {
      await rig.setup('should generate telemetry events for hook executions', {
        fakeResponsesPath: join(
          import.meta.dirname,
          'hooks-system.telemetry.responses',
        ),
      });
      // Create a platform-appropriate hook script for telemetry testing
      const hookCommand = createPlatformHookScript(
        JSON.stringify({
          decision: 'allow',
          reason: 'Telemetry test hook',
        }),
        rig.testDir!,
        'telemetry_hook',
      );

      await rig.setup('should generate telemetry events for hook executions', {
        settings: {
          tools: {
            enableHooks: true,
          },
          hooks: {
            BeforeTool: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: hookCommand,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      });

      const prompt = 'Create a file called telemetry-test.txt';
      await rig.run(prompt);

      // Should execute the tool
      const foundWriteFile = await rig.waitForToolCall('write_file');
      expect(foundWriteFile).toBeTruthy();

      // Should generate hook telemetry
      const hookTelemetryFound = await rig.waitForTelemetryEvent('hook_call');
      expect(hookTelemetryFound).toBeTruthy();
    });
  });
});
