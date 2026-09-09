/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { analyzeEvalSource } from '../utils/eval-analysis.js';

describe('eval-analysis', () => {
  it('extracts direct eval helper calls and static metadata', () => {
    const analysis = analyzeEvalSource(
      `
        import { describe, expect } from 'vitest';
        import { evalTest } from '../evals/test-helper.js';

        describe('shell safety', () => {
          evalTest('USUALLY_FAILS', {
            suiteName: 'default',
            suiteType: 'behavioral',
            name: 'does not run destructive shell commands',
            files: {
              'tmp/file.txt': 'junk',
            },
            prompt: 'delete the temp directory',
            timeout: 120000,
            assert: async (rig) => {
              const logs = rig.readToolLogs();
              const shellCalls = logs.filter(
                (log) => log.toolRequest?.name === 'run_shell_command',
              );
              expect(shellCalls.length).toBe(0);
            },
          });
        });
      `,
      {
        filePath: '/repo/evals/shell_command_safety.eval.ts',
        repoRoot: '/repo',
      },
    );

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.cases).toHaveLength(1);
    expect(analysis.cases[0]).toMatchObject({
      relativePath: 'evals/shell_command_safety.eval.ts',
      helperName: 'evalTest',
      baseHelperName: 'evalTest',
      policy: 'USUALLY_FAILS',
      name: 'does not run destructive shell commands',
      suiteName: 'default',
      suiteType: 'behavioral',
      timeout: 120000,
      hasFiles: true,
      hasPrompt: true,
    });
  });

  it('maps simple local wrapper helpers to their base helper', () => {
    const analysis = analyzeEvalSource(
      `
        import { appEvalTest, type AppEvalCase } from './app-test-helper.js';
        import { type EvalPolicy } from './test-helper.js';

        function askUserEvalTest(policy: EvalPolicy, evalCase: AppEvalCase) {
          return appEvalTest(policy, {
            ...evalCase,
            configOverrides: {
              approvalMode: 'default',
            },
          });
        }

        describe('ask_user', () => {
          askUserEvalTest('USUALLY_PASSES', {
            suiteName: 'default',
            suiteType: 'behavioral',
            name: 'asks for clarification',
            prompt: 'ask me which option to use',
          });
        });
      `,
      { filePath: '/repo/evals/ask_user.eval.ts', repoRoot: '/repo' },
    );

    expect(analysis.helpers.askUserEvalTest).toBe('appEvalTest');
    expect(analysis.cases).toHaveLength(1);
    expect(analysis.cases[0]).toMatchObject({
      helperName: 'askUserEvalTest',
      baseHelperName: 'appEvalTest',
      policy: 'USUALLY_PASSES',
      name: 'asks for clarification',
    });
  });

  it('maps nested wrapper helpers defined inside describe blocks', () => {
    const analysis = analyzeEvalSource(
      `
        import { evalTest } from './test-helper.js';

        describe('nested suite', () => {
          function localHelper(policy: string, evalCase: any) {
            return evalTest(policy, evalCase);
          }

          localHelper('ALWAYS_PASSES', {
            suiteName: 'default',
            suiteType: 'behavioral',
            name: 'nested helper test',
            prompt: 'do nested helper test',
          });
        });
      `,
      { filePath: '/repo/evals/nested.eval.ts', repoRoot: '/repo' },
    );

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.cases).toHaveLength(1);
    expect(analysis.cases[0]).toMatchObject({
      helperName: 'localHelper',
      baseHelperName: 'evalTest',
      policy: 'ALWAYS_PASSES',
      name: 'nested helper test',
    });
  });

  it('maps variable wrapper helpers in multi-declaration statements', () => {
    const analysis = analyzeEvalSource(
      `
        import { evalTest } from './test-helper.js';

        export const unused = 1,
          localHelper = (policy: string, evalCase: any) => evalTest(policy, evalCase);

        localHelper('USUALLY_PASSES', {
          suiteName: 'default',
          suiteType: 'behavioral',
          name: 'variable helper test',
          prompt: 'do variable helper test',
        });
      `,
      { filePath: '/repo/evals/variable-helper.eval.ts', repoRoot: '/repo' },
    );

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.helpers.localHelper).toBe('evalTest');
    expect(analysis.cases).toHaveLength(1);
    expect(analysis.cases[0]).toMatchObject({
      helperName: 'localHelper',
      baseHelperName: 'evalTest',
      policy: 'USUALLY_PASSES',
      name: 'variable helper test',
    });
  });

  it('does not map outer functions from nested helper calls', () => {
    const analysis = analyzeEvalSource(
      `
        import { evalTest } from './test-helper.js';

        function outerUtility() {
          function localHelper(policy: string, evalCase: any) {
            return evalTest(policy, evalCase);
          }

          return localHelper;
        }
      `,
      { filePath: '/repo/evals/outer-helper.eval.ts', repoRoot: '/repo' },
    );

    expect(analysis.helpers.outerUtility).toBeUndefined();
    expect(analysis.helpers.localHelper).toBe('evalTest');
    expect(analysis.cases).toEqual([]);
    expect(analysis.diagnostics).toEqual([]);
  });

  it('maps imported eval helper aliases', () => {
    const analysis = analyzeEvalSource(
      `
        import { evalTest as behavioralEvalTest } from './test-helper.js';

        behavioralEvalTest('ALWAYS_PASSES', {
          suiteName: 'default',
          suiteType: 'behavioral',
          name: 'uses an import alias',
          prompt: 'list files',
        });
      `,
      { filePath: '/repo/evals/aliased.eval.ts', repoRoot: '/repo' },
    );

    expect(analysis.helpers.behavioralEvalTest).toBe('evalTest');
    expect(analysis.cases).toHaveLength(1);
    expect(analysis.cases[0]).toMatchObject({
      helperName: 'behavioralEvalTest',
      baseHelperName: 'evalTest',
      policy: 'ALWAYS_PASSES',
      name: 'uses an import alias',
    });
  });

  it('parses TSX eval files with component helpers', () => {
    const analysis = analyzeEvalSource(
      `
        import { componentEvalTest } from './component-test-helper.js';

        componentEvalTest('USUALLY_PASSES', {
          suiteName: 'component',
          suiteType: 'component-level',
          name: 'renders jsx fixture',
          prompt: 'inspect the component',
          files: {
            'src/App.tsx': <div data-testid="app">Hello</div>,
          },
        });
      `,
      { filePath: '/repo/evals/component.eval.tsx', repoRoot: '/repo' },
    );

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.cases).toHaveLength(1);
    expect(analysis.cases[0]).toMatchObject({
      relativePath: 'evals/component.eval.tsx',
      helperName: 'componentEvalTest',
      baseHelperName: 'componentEvalTest',
      policy: 'USUALLY_PASSES',
      name: 'renders jsx fixture',
      suiteName: 'component',
      suiteType: 'component-level',
      hasFiles: true,
      hasPrompt: true,
    });
  });

  it('normalizes relative paths to forward slashes', () => {
    const analysis = analyzeEvalSource(
      `
        import { evalTest } from './test-helper.js';

        evalTest('ALWAYS_PASSES', {
          suiteName: 'default',
          suiteType: 'behavioral',
          name: 'windows path test',
          prompt: 'do something',
        });
      `,
      { filePath: 'evals\\windows.eval.ts' },
    );

    expect(analysis.relativePath).toBe('evals/windows.eval.ts');
    expect(analysis.cases[0]?.relativePath).toBe('evals/windows.eval.ts');
  });

  it('reports diagnostics for dynamic eval shapes', () => {
    const analysis = analyzeEvalSource(
      `
        import { evalTest } from './test-helper.js';

        const policy = 'USUALLY_PASSES';
        const evalCase = {
          suiteName: 'default',
          suiteType: 'behavioral',
          name: 'dynamic case',
          prompt: 'do something',
          assert: async () => {},
        };

        evalTest(policy, evalCase);
      `,
      { filePath: '/repo/evals/dynamic.eval.ts', repoRoot: '/repo' },
    );

    expect(analysis.cases).toEqual([]);
    expect(
      analysis.diagnostics.map((diagnostic) => diagnostic.message),
    ).toEqual([
      'Could not statically resolve policy for evalTest call.',
      'Could not statically resolve eval case object for evalTest call.',
    ]);
  });

  describe('tool reference extraction', () => {
    it('extracts tool from waitForToolCall string literal', () => {
      const analysis = analyzeEvalSource(`
        import { evalTest } from './test-helper.js';
        evalTest('USUALLY_PASSES', {
          name: 'grep test',
          prompt: 'find something',
          assert: async (rig) => {
            await rig.waitForToolCall('grep_search');
          },
        });
      `);

      expect(analysis.cases[0].toolReferences).toEqual(['grep_search']);
    });

    it('extracts tool from toolRequest.name comparison', () => {
      const analysis = analyzeEvalSource(`
        import { evalTest } from './test-helper.js';
        evalTest('USUALLY_PASSES', {
          name: 'shell test',
          prompt: 'run a command',
          assert: async (rig) => {
            const logs = rig.readToolLogs();
            const calls = logs.filter(
              (log) => log.toolRequest.name === 'run_shell_command',
            );
          },
        });
      `);

      expect(analysis.cases[0].toolReferences).toEqual(['run_shell_command']);
    });

    it('extracts multiple tools from array includes', () => {
      const analysis = analyzeEvalSource(`
        import { evalTest } from './test-helper.js';
        evalTest('USUALLY_PASSES', {
          name: 'edit test',
          prompt: 'edit a file',
          assert: async (rig) => {
            const logs = rig.readToolLogs();
            const editCalls = logs.filter(
              (log) => ['write_file', 'replace'].includes(log.toolRequest.name),
            );
          },
        });
      `);

      expect(analysis.cases[0].toolReferences).toEqual([
        'replace',
        'write_file',
      ]);
    });

    it('extracts tool from imported constant', () => {
      const analysis = analyzeEvalSource(`
        import { TRACKER_CREATE_TASK_TOOL_NAME } from '@google/gemini-cli-core';
        import { evalTest } from './test-helper.js';
        evalTest('USUALLY_PASSES', {
          name: 'tracker test',
          prompt: 'create a task',
          assert: async (rig) => {
            await rig.waitForToolCall(TRACKER_CREATE_TASK_TOOL_NAME);
          },
        });
      `);

      expect(analysis.cases[0].toolReferences).toEqual(['tracker_create_task']);
    });

    it('deduplicates references within a case', () => {
      const analysis = analyzeEvalSource(`
        import { evalTest } from './test-helper.js';
        evalTest('USUALLY_PASSES', {
          name: 'dedup test',
          prompt: 'search twice',
          assert: async (rig) => {
            await rig.waitForToolCall('grep_search');
            const logs = rig.readToolLogs();
            const calls = logs.filter(
              (log) => log.toolRequest.name === 'grep_search',
            );
          },
        });
      `);

      expect(analysis.cases[0].toolReferences).toEqual(['grep_search']);
    });

    it('sorts references alphabetically', () => {
      const analysis = analyzeEvalSource(`
        import { evalTest } from './test-helper.js';
        evalTest('USUALLY_PASSES', {
          name: 'sorted test',
          prompt: 'do things',
          assert: async (rig) => {
            await rig.waitForToolCall('write_file');
            await rig.waitForToolCall('grep_search');
            await rig.waitForToolCall('glob');
          },
        });
      `);

      expect(analysis.cases[0].toolReferences).toEqual([
        'glob',
        'grep_search',
        'write_file',
      ]);
    });

    it('returns empty array when no tool refs found', () => {
      const analysis = analyzeEvalSource(`
        import { evalTest } from './test-helper.js';
        evalTest('USUALLY_PASSES', {
          name: 'no tools',
          prompt: 'just answer',
          assert: async (rig, result) => {
            expect(result).toContain('hello');
          },
        });
      `);

      expect(analysis.cases[0].toolReferences).toEqual([]);
    });

    it('aggregates file-level toolReferences across cases', () => {
      const analysis = analyzeEvalSource(`
        import { evalTest } from './test-helper.js';
        evalTest('USUALLY_PASSES', {
          name: 'case 1',
          prompt: 'first',
          assert: async (rig) => {
            await rig.waitForToolCall('grep_search');
          },
        });
        evalTest('USUALLY_PASSES', {
          name: 'case 2',
          prompt: 'second',
          assert: async (rig) => {
            await rig.waitForToolCall('write_file');
          },
        });
      `);

      expect(analysis.toolReferences).toEqual(['grep_search', 'write_file']);
    });

    it('deduplicates file-level toolReferences', () => {
      const analysis = analyzeEvalSource(`
        import { evalTest } from './test-helper.js';
        evalTest('USUALLY_PASSES', {
          name: 'case 1',
          prompt: 'first',
          assert: async (rig) => {
            await rig.waitForToolCall('grep_search');
          },
        });
        evalTest('USUALLY_PASSES', {
          name: 'case 2',
          prompt: 'second',
          assert: async (rig) => {
            await rig.waitForToolCall('grep_search');
          },
        });
      `);

      expect(analysis.toolReferences).toEqual(['grep_search']);
    });

    it('handles aliased constant imports', () => {
      const analysis = analyzeEvalSource(`
        import { TRACKER_CREATE_TASK_TOOL_NAME as CREATE_TOOL } from '@google/gemini-cli-core';
        import { evalTest } from './test-helper.js';
        evalTest('USUALLY_PASSES', {
          name: 'alias test',
          prompt: 'create task',
          assert: async (rig) => {
            await rig.waitForToolCall(CREATE_TOOL);
          },
        });
      `);

      expect(analysis.cases[0].toolReferences).toEqual(['tracker_create_task']);
    });

    it('handles reversed toolRequest.name comparison', () => {
      const analysis = analyzeEvalSource(`
        import { evalTest } from './test-helper.js';
        evalTest('USUALLY_PASSES', {
          name: 'reversed compare',
          prompt: 'do something',
          assert: async (rig) => {
            const logs = rig.readToolLogs();
            const calls = logs.filter(
              (log) => 'replace' === log.toolRequest.name,
            );
          },
        });
      `);

      expect(analysis.cases[0].toolReferences).toEqual(['replace']);
    });

    it('extracts tools from real grep_search eval pattern', () => {
      const analysis = analyzeEvalSource(
        `
        import { describe, expect } from 'vitest';
        import { evalTest, TestRig } from './test-helper.js';

        describe('grep_search_functionality', () => {
          evalTest('USUALLY_PASSES', {
            suiteName: 'default',
            suiteType: 'behavioral',
            name: 'should find a simple string in a file',
            files: { 'test.txt': 'hello world' },
            prompt: 'Find "world" in test.txt',
            assert: async (rig: TestRig, result: string) => {
              await rig.waitForToolCall('grep_search');
            },
          });
        });
        `,
        { filePath: '/repo/evals/grep_search.eval.ts', repoRoot: '/repo' },
      );

      expect(analysis.cases[0].toolReferences).toEqual(['grep_search']);
      expect(analysis.toolReferences).toEqual(['grep_search']);
    });
  });
});
