import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Git Non-Interactiveness', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should run git clone non-interactively',
    prompt: 'Clone the following repo without asking for input or making changes: https://github.com/MD-J1/Radial-Art.git',
    assert: async (rig) => {
      const logs = rig.readToolLogs();

      const gitCommands = logs.filter(
        (call) => call.toolRequest.name === 'run_shell_command'
      );

      const nonInteractive = gitCommands.some((call) => {
        const args = typeof call.toolRequest.args === 'string'
          ? JSON.parse(call.toolRequest.args)
          : call.toolRequest.args;

        const cmd = (args as any)['command'] || '';
        return cmd.includes('git clone') && !cmd.includes('--interactive');
      });

      expect(
        nonInteractive,
        'Expected agent to use git clone non-interactively'
      ).toBe(true);
    },
  });
});
