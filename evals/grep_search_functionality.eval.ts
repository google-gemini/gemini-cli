/**
 * @license
 * Copyright 202 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, TestRig } from './test-helper.js';
import {
  assertModelHasOutput,
  checkModelOutputContent,
} from './test-helper.js';

describe('grep_search_functionality', () => {
  const TEST_PREFIX = 'Grep Search Functionality: ';

  evalTest('USUALLY_PASSES', {
    name: 'should find a simple string in a file',
    files: {
      'test.txt': `hello
    world
    hello world`,
    },
    prompt: 'Find "world" in test.txt',
    assert: async (rig: TestRig, result: string) => {
      await rig.waitForToolCall('grep_search');
      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/L2: world/, /L3: hello world/],
        testName: `${TEST_PREFIX}simple search`,
      });
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should perform a case-sensitive search',
    files: {
      'test.txt': `Hello
    hello`,
    },
    prompt: 'Find "Hello" in test.txt, case-sensitively.',
    assert: async (rig: TestRig, result: string) => {
      const wasToolCalled = await rig.waitForToolCall(
        'grep_search',
        undefined,
        (args) => {
          const params = JSON.parse(args);
          return params.case_sensitive === true;
        },
      );
      expect(
        wasToolCalled,
        'Expected grep_search to be called with case_sensitive: true',
      ).toBe(true);

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/L1: Hello/],
        forbiddenContent: [/L2: hello/],
        testName: `${TEST_PREFIX}case-sensitive search`,
      });
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should return only file names when names_only is used',
    files: {
      'file1.txt': 'match me',
      'file2.txt': 'match me',
    },
    prompt: 'Find the files containing "match me".',
    assert: async (rig: TestRig, result: string) => {
      const wasToolCalled = await rig.waitForToolCall(
        'grep_search',
        undefined,
        (args) => {
          const params = JSON.parse(args);
          return params.names_only === true;
        },
      );
      expect(
        wasToolCalled,
        'Expected grep_search to be called with names_only: true',
      ).toBe(true);

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/file1.txt/, /file2.txt/],
        forbiddenContent: [/L1:/],
        testName: `${TEST_PREFIX}names_only search`,
      });
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should search only within the specified include glob',
    files: {
      'file.js': 'my_function();',
      'file.ts': 'my_function();',
    },
    prompt: 'Find "my_function" in .js files.',
    assert: async (rig: TestRig, result: string) => {
      const wasToolCalled = await rig.waitForToolCall(
        'grep_search',
        undefined,
        (args) => {
          const params = JSON.parse(args);
          return params.include === '*.js';
        },
      );
      expect(
        wasToolCalled,
        'Expected grep_search to be called with include: "*.js"',
      ).toBe(true);

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/file.js/],
        forbiddenContent: [/file.ts/],
        testName: `${TEST_PREFIX}include glob search`,
      });
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should search within a specific subdirectory',
    files: {
      'src/main.js': 'unique_string_1',
      'lib/main.js': 'unique_string_2',
    },
    prompt: 'Find "unique_string" in the src directory.',
    assert: async (rig: TestRig, result: string) => {
      const wasToolCalled = await rig.waitForToolCall(
        'grep_search',
        undefined,
        (args) => {
          const params = JSON.parse(args);
          return params.dir_path === 'src';
        },
      );
      expect(
        wasToolCalled,
        'Expected grep_search to be called with dir_path: "src"',
      ).toBe(true);

      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/unique_string_1/],
        forbiddenContent: [/unique_string_2/],
        testName: `${TEST_PREFIX}subdirectory search`,
      });
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should report no matches correctly',
    files: {
      'file.txt': 'nothing to see here',
    },
    prompt: 'Find "nonexistent" in file.txt',
    assert: async (rig: TestRig, result: string) => {
      await rig.waitForToolCall('grep_search');
      assertModelHasOutput(result);
      checkModelOutputContent(result, {
        expectedContent: [/No matches found/],
        testName: `${TEST_PREFIX}no matches`,
      });
    },
  });
});
