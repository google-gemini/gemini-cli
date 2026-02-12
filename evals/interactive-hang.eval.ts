import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('interactive_commands', () => {
  /**
   * Validates that the agent does not use interactive commands unprompted.
   * Interactive commands block the progress of the agent, requiring user
   * intervention.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should not use interactive commands',
    prompt: 'Execute tests.',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'example',
          type: 'module',
          devDependencies: {
            vitest: 'latest',
          },
        },
        null,
        2,
      ),
      'example.test.js': `
        import { test, expect } from 'vitest';
        test('it works', () => {
          expect(1 + 1).toBe(2);
        });
      `,
    },
    assert: async (rig, result) => {
      const logs = rig.readToolLogs();
      const vitestCall = logs.find(
        (l) =>
          l.toolRequest.name === 'run_shell_command' &&
          l.toolRequest.args.toLowerCase().includes('vitest'),
      );

      expect(vitestCall, 'Agent should have called vitest').toBeDefined();
      expect(
        vitestCall?.toolRequest.args,
        'Agent should have passed run arg',
      ).toMatch(/\b(run|--run)\b/);
    },
  });
});
