import { test, expect } from 'vitest';
import { AgentTestRig } from './app-test-helper.js';

test('Sandbox recovery: attempts to use additional_permissions when operation not permitted', async () => {
  const rig = new AgentTestRig();
  await rig.initialize();

  const originalExecute = rig.toolExecutor.execute.bind(rig.toolExecutor);

  rig.toolExecutor.execute = async (toolName, params, ctx) => {
    if (toolName === 'run_shell_command') {
      if (!params.additional_permissions) {
        return {
          output: 'cat: /etc/shadow: Operation not permitted',
          exitCode: 1,
          error: {
            message: 'Command failed',
          },
        };
      } else {
        return {
          output: 'success',
          exitCode: 0,
        };
      }
    }
    return originalExecute(toolName, params, ctx);
  };

  await rig.addInput('cat /etc/shadow');

  const result = await rig.run();

  expect(result.toolCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'run_shell_command',
        args: expect.objectContaining({
          command: expect.stringContaining('cat /etc/shadow'),
        }),
      }),
      expect.objectContaining({
        name: 'run_shell_command',
        args: expect.objectContaining({
          command: expect.stringContaining('cat /etc/shadow'),
          additional_permissions: expect.any(Object),
        }),
      }),
    ]),
  );
});
