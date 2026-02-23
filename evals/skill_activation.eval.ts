/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Skill Activation Behavioral Evals', () => {
  /**
   * Tests that the model proactively activates the software-engineering skill
   * when faced with a typical engineering task like bug fixing.
   */
  evalTest('ALWAYS_PASSES', {
    name: 'should activate software-engineering skill for bug fixes',
    prompt:
      'There is a bug in the greeting logic in src/index.ts. Please fix it.',
    files: {
      'src/index.ts':
        'export const greet = (name: string) => `Hello, ${name}!`;',
      'src/index.test.ts': `
import { greet } from './index';
import { expect, test } from 'vitest';
test('greet', () => { expect(greet('World')).toBe('Hello, World!'); });
      `,
    },
    assert: async (rig) => {
      await rig.expectToolCallSuccess(['activate_skill'], undefined, (args) => {
        try {
          const parsed = JSON.parse(args);
          return parsed.name === 'software-engineering';
        } catch {
          return false;
        }
      });
    },
  });

  /**
   * Tests that the model proactively activates the new-application skill
   * when asked to scaffold a new project.
   */
  evalTest('ALWAYS_PASSES', {
    name: 'should activate new-application skill for prototyping',
    prompt: 'Build me a new Todo app using React and Vanilla CSS.',
    assert: async (rig) => {
      await rig.expectToolCallSuccess(['activate_skill'], undefined, (args) => {
        try {
          const parsed = JSON.parse(args);
          return parsed.name === 'new-application';
        } catch {
          return false;
        }
      });
    },
  });

  /**
   * Tests that the model proactively activates the docs-writer skill
   * when asked to update documentation files.
   */
  evalTest('ALWAYS_PASSES', {
    name: 'should activate docs-writer skill for documentation tasks',
    prompt:
      'Update the documentation in docs/index.md to include the new features.',
    files: {
      'docs/index.md': `# Documentation

Existing content.`,
    },
    assert: async (rig) => {
      await rig.expectToolCallSuccess(['activate_skill'], undefined, (args) => {
        try {
          const parsed = JSON.parse(args);
          return parsed.name === 'docs-writer';
        } catch {
          return false;
        }
      });
    },
  });

  /**
   * Tests that the model can handle multi-step tasks that might require
   * activating multiple skills sequentially (though usually it just activates one).
   */
  evalTest('USUALLY_PASSES', {
    name: 'should activate software-engineering even when the prompt is slightly indirect',
    prompt:
      'The CI is failing on the main branch. Can you investigate and fix whatever is broken?',
    files: {
      'package.json': '{ "scripts": { "test": "vitest run" } }',
      'src/logic.ts':
        'export const compute = () => { throw new Error("Broken"); };',
      'src/logic.test.ts':
        'import { compute } from "./logic"; import { test } from "vitest"; test("compute", () => { compute(); });',
    },
    assert: async (rig) => {
      await rig.expectToolCallSuccess(['activate_skill'], undefined, (args) => {
        try {
          const parsed = JSON.parse(args);
          return parsed.name === 'software-engineering';
        } catch {
          return false;
        }
      });
    },
  });
});
