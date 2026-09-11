/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

describe.sequential('error_recovery', () => {
  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent recovers from file-not-found error by searching repository and reading correct file',
    files: {
      'src/math.js':
        'export function divide(a, b) {\n  if (b === 0) throw new Error("Divide by zero");\n  return a / b;\n}\n',
      'src/index.js':
        'import { divide } from "./math.js";\nconsole.log(divide(10, 2));\n',
    },
    prompt:
      'Check the contents of src/utils/math.js to inspect how error handling is implemented for divide. If the file is not found, search the repository for math.js and inspect the actual file.',
    setup: async (rig) => {
      rig.setBreakpoint(['read_file', 'grep_search', 'glob']);
    },
    assert: async (rig) => {
      const firstConfirmation = await rig.waitForPendingConfirmation(
        ['read_file', 'grep_search', 'glob'],
        30000,
      );

      expect(
        firstConfirmation,
        'Expected initial tool call confirmation',
      ).toBeDefined();

      await rig.resolveTool(firstConfirmation);

      const secondConfirmation = await rig.waitForPendingConfirmation(
        ['read_file', 'grep_search', 'glob'],
        30000,
      );

      expect(
        secondConfirmation,
        'Expected recovery tool call after file-not-found error',
      ).toBeDefined();

      await rig.resolveTool(secondConfirmation);

      const toolCalls = (rig as any).getToolCalls();
      const readMathCall = toolCalls.find((call: any) => {
        if (call.request?.name !== 'read_file') return false;
        const argsStr = JSON.stringify(call.request?.args ?? {}).toLowerCase();
        return argsStr.includes('math.js');
      });

      if (!readMathCall) {
        const thirdConfirmation = await rig.waitForPendingConfirmation(
          ['read_file'],
          30000,
        );
        expect(
          thirdConfirmation,
          'Expected read_file confirmation for src/math.js',
        ).toBeDefined();
        await rig.resolveTool(thirdConfirmation);
      }

      const updatedToolCalls = (rig as any).getToolCalls();
      const readFileCalls = updatedToolCalls.filter(
        (call: any) => call.request?.name === 'read_file',
      );
      expect(
        readFileCalls.length,
        'Agent must invoke read_file during recovery flow',
      ).toBeGreaterThanOrEqual(1);

      const hasReadCorrectFile = readFileCalls.some((call: any) => {
        const argsStr = JSON.stringify(call.request?.args ?? {}).toLowerCase();
        return argsStr.includes('math.js') && !argsStr.includes('utils');
      });

      expect(
        hasReadCorrectFile,
        'Agent must recover and invoke read_file targeting src/math.js',
      ).toBe(true);

      await rig.waitForIdle(30000);
    },
  });
});
