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

  /**
   * Validates that the agent uses non-interactive flags when scaffolding a new project.
   */
  evalTest('ALWAYS_PASSES', {
    name: 'should use non-interactive flags when scaffolding a new app',
    prompt: 'Create a new react application named my-app using vite.',
    assert: async (rig, result) => {
      const logs = rig.readToolLogs();
      const scaffoldCall = logs.find(
        (l) =>
          l.toolRequest.name === 'run_shell_command' &&
          /npm (init|create)|npx create-|yarn create|pnpm create/.test(
            l.toolRequest.args,
          ),
      );

      expect(
        scaffoldCall,
        'Agent should have called a scaffolding command (e.g., npm create)',
      ).toBeDefined();
      expect(
        scaffoldCall?.toolRequest.args,
        'Agent should have passed a non-interactive flag (-y, --yes, or a specific --template)',
      ).toMatch(/(?:^|\s)(--yes|-y|--template\s+\S+)(?:\s|$|\\|")/);
    },
  });
});
