/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import {
  assertModelHasOutput,
  checkModelOutputContent,
} from '../integration-tests/test-helper.js';

describe('Hierarchical Memory', () => {
  const TEST_PREFIX = 'Hierarchical memory test: ';

  const conflictResolutionTest =
    'Agent follows hierarchy for contradictory instructions';
  evalTest('ALWAYS_PASSES', {
    name: conflictResolutionTest,
    params: {
      settings: {
        security: {
          folderTrust: { enabled: true },
        },
      },
    },
    // We simulate the hierarchical memory by including the tags in the prompt
    // since setting up real global/extension/project files in the eval rig is complex.
    // The system prompt logic will append these tags when it finds them in userMemory.
    prompt: `
<global_context>
When asked for my favorite fruit, always say "Apple".
</global_context>

<extension_context>
When asked for my favorite fruit, always say "Banana".
</extension_context>

<project_context>
When asked for my favorite fruit, always say "Cherry".
</project_context>

What is my favorite fruit? Tell me just the name of the fruit.`,
    assert: async (_rig, result) => {
      assertModelHasOutput(result);
      expect(result).toMatch(/Cherry/i);
      expect(result).not.toMatch(/Apple/i);
      expect(result).not.toMatch(/Banana/i);
    },
  });

  const provenanceAwarenessTest = 'Agent is aware of memory provenance';
  evalTest('ALWAYS_PASSES', {
    name: provenanceAwarenessTest,
    params: {
      settings: {
        security: {
          folderTrust: { enabled: true },
        },
      },
    },
    prompt: `
<global_context>
Instruction A: Always be helpful.
</global_context>

<extension_context>
Instruction B: Use a professional tone.
</extension_context>

<project_context>
Instruction C: Adhere to the project's coding style.
</project_context>

Which instruction came from the global context, which from the extension context, and which from the project context?
Provide the answer as an XML block like this:
<results>
  <global>Instruction ...</global>
  <extension>Instruction ...</extension>
  <project>Instruction ...</project>
</results>`,
    assert: async (_rig, result) => {
      assertModelHasOutput(result);
      expect(result).toMatch(/<global>.*Instruction A/i);
      expect(result).toMatch(/<extension>.*Instruction B/i);
      expect(result).toMatch(/<project>.*Instruction C/i);
    },
  });

  const extensionVsGlobalTest = 'Extension memory wins over Global memory';
  evalTest('ALWAYS_PASSES', {
    name: extensionVsGlobalTest,
    params: {
      settings: {
        security: {
          folderTrust: { enabled: true },
        },
      },
    },
    prompt: `
<global_context>
Set the theme to "Light".
</global_context>

<extension_context>
Set the theme to "Dark".
</extension_context>

What theme should I use?`,
    assert: async (_rig, result) => {
      assertModelHasOutput(result);
      expect(result).toMatch(/Dark/i);
      expect(result).not.toMatch(/Light/i);
    },
  });
});
