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
        const env = (args as any)['env'] || {};

        // Check that git clone is used and the environment disables prompts
        return cmd.includes('git clone') && env.GIT_TERMINAL_PROMPT === '0';
      });

      expect(
        nonInteractive,
        'Expected agent to run git clone with GIT_TERMINAL_PROMPT=0 to ensure non-interactivity'
      ).toBe(true);
    },
  });
});
