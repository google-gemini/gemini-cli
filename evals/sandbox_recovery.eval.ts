import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Sandbox recovery', () => {
  evalTest('USUALLY_PASSES', {
    name: 'attempts to use additional_permissions when operation not permitted',
    prompt:
      'Run ./script.sh. It will fail with "Operation not permitted". When it does, you must retry running it by passing the appropriate additional_permissions.',
    files: {
      'script.sh':
        '#!/bin/bash\necho "cat: /etc/shadow: Operation not permitted" >&2\nexit 1\n',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) =>
          log.toolRequest?.name === 'run_shell_command' &&
          log.toolRequest?.args?.includes('script.sh'),
      );

      // The agent should have tried running the command.
      expect(
        shellCalls.length,
        'Agent should have called run_shell_command',
      ).toBeGreaterThan(0);

      // Look for a call that includes additional_permissions.
      const hasAdditionalPermissions = shellCalls.some((call) => {
        const args =
          typeof call.toolRequest.args === 'string'
            ? JSON.parse(call.toolRequest.args)
            : call.toolRequest.args;
        return args.additional_permissions !== undefined;
      });

      expect(
        hasAdditionalPermissions,
        'Agent should have retried with additional_permissions',
      ).toBe(true);
    },
  });
});
