
import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Git Non-Interactiveness', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should run git clone non-interactively',
    prompt: 'Run the following commands non-interactively: echo $GIT_TERMINAL_PROMPT; git clone https://github.com/MD-J1/Radial-Art.git',
    assert: async (rig) => {
      const logs = rig.readToolLogs();

      // Filter only the shell commands executed
      const shellCommands = logs.filter(
        (call) => call.toolRequest.name === 'run_shell_command'
      );

  const terminalPromptSet = shellCommands.some((call) => {
  const output = rig.readToolOutput(call);
  const firstLine = output.split('\n')[0].trim();
  return firstLine === '0';
});

      expect(
        terminalPromptSet,
        'Expected GIT_TERMINAL_PROMPT=0 to ensure non-interactive git clone'
      ).toBe(true);

      const gitCloneRan = shellCommands.some((call) => {
        const args = typeof call.toolRequest.args === 'string'
          ? JSON.parse(call.toolRequest.args)
          : call.toolRequest.args;

        const cmd = (args as any)['command'] || '';
        return cmd.includes('git clone');
      });

      expect(
        gitCloneRan,
        'Expected agent to run git clone'
      ).toBe(true);
    },
  });
});
