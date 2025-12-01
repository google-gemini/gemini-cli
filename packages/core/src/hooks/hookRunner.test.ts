/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { HookRunner } from './hookRunner.js';
import {
  HookEventName,
  HookType,
  type HookConfig,
  type HookInput,
  type BeforeAgentInput,
  type BeforeModelInput,
} from './types.js';

const mockConsole = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.stubGlobal('console', mockConsole);

describe('HookRunner', () => {
  let hookRunner: HookRunner;
  let projectDir: string;

  const baseInput: HookInput = {
    session_id: 'test-session',
    transcript_path: '/path/to/transcript',
    cwd: '',
    hook_event_name: HookEventName.BeforeTool,
    timestamp: '2025-01-01T00:00:00.000Z',
  };

  const createInput = <T extends HookInput>(overrides: Partial<T> = {}): T =>
    ({
      ...baseInput,
      cwd: overrides.cwd ?? projectDir,
      ...overrides,
    }) as T;

  const writeHookScript = (
    relativePath: string,
    body: string,
    dir: string = projectDir,
  ): string => {
    const filePath = path.join(dir, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, `#!/usr/bin/env node\n${body}`);
    chmodSync(filePath, 0o755);
    const rel = path.relative(dir, filePath).replace(/\\/g, '/');
    const commandPath = `./${rel}`;
    if (process.platform === 'win32') {
      // PowerShell does not honor POSIX shebangs; invoke node explicitly.
      return `node ${JSON.stringify(commandPath)}`;
    }
    return commandPath;
  };

  const readProjectFile = (relativePath: string, dir: string = projectDir) =>
    readFileSync(path.join(dir, relativePath), 'utf8');

  beforeEach(() => {
    hookRunner = new HookRunner();
    projectDir = mkdtempSync(path.join(tmpdir(), 'hook-runner-test-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('executeHook', () => {
    it('executes a command hook successfully with JSON output', async () => {
      const expectedOutput = { decision: 'allow', reason: 'All good' };
      const command = writeHookScript(
        'hooks/success.cjs',
        `
const payload = ${JSON.stringify(expectedOutput)};
console.log(JSON.stringify(payload));
`,
      );

      const config: HookConfig = { type: HookType.Command, command };
      const result = await hookRunner.executeHook(
        config,
        HookEventName.BeforeTool,
        createInput(),
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual(expectedOutput);
      expect(result.exitCode).toBe(0);
    });

    it('captures stderr and non-zero exits', async () => {
      const errorMessage = 'Command failed';
      const command = writeHookScript(
        'hooks/fail.cjs',
        `
console.error(${JSON.stringify(errorMessage)});
process.exit(1);
`,
      );

      const config: HookConfig = { type: HookType.Command, command };
      const result = await hookRunner.executeHook(
        config,
        HookEventName.BeforeTool,
        createInput(),
      );

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr?.trim()).toBe(errorMessage);
      expect(result.output).toEqual({
        decision: 'allow',
        systemMessage: `Warning: ${errorMessage}`,
      });
    });

    it('reports errors when the hook command is missing', async () => {
      const config: HookConfig = {
        type: HookType.Command,
        command: './hooks/does-not-exist.cjs',
      };

      const result = await hookRunner.executeHook(
        config,
        HookEventName.BeforeTool,
        createInput(),
      );

      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr && result.stderr.length).toBeGreaterThan(0);
    });

    it('times out long-running hooks', async () => {
      const command = writeHookScript(
        'hooks/hang.cjs',
        `
setInterval(() => {}, 1000);
`,
      );

      const config: HookConfig = {
        type: HookType.Command,
        command,
        timeout: 50,
      };

      const result = await hookRunner.executeHook(
        config,
        HookEventName.BeforeTool,
        createInput(),
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timed out');
    }, 15000);

    it('converts plain text stdout to HookOutput when JSON parsing fails', async () => {
      const plainText = 'Add this context';
      const command = writeHookScript(
        'hooks/plain.cjs',
        `
console.log(${JSON.stringify(plainText)});
`,
      );

      const result = await hookRunner.executeHook(
        { type: HookType.Command, command },
        HookEventName.BeforeTool,
        createInput(),
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        decision: 'allow',
        systemMessage: plainText,
      });
    });

    it('treats exit code 2 stderr as blocking error output', async () => {
      const errorMessage = 'Blocking error';
      const command = writeHookScript(
        'hooks/blocking.cjs',
        `
console.error(${JSON.stringify(errorMessage)});
process.exit(2);
`,
      );

      const result = await hookRunner.executeHook(
        { type: HookType.Command, command },
        HookEventName.BeforeTool,
        createInput(),
      );

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.output).toEqual({
        decision: 'deny',
        reason: errorMessage,
      });
    });

    it('handles double-encoded JSON hook output', async () => {
      const payload = { decision: 'allow', reason: 'Nested' };
      const command = writeHookScript(
        'hooks/double.cjs',
        `
const payload = ${JSON.stringify(payload)};
console.log(JSON.stringify(JSON.stringify(payload)));
`,
      );

      const result = await hookRunner.executeHook(
        { type: HookType.Command, command },
        HookEventName.BeforeTool,
        createInput(),
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual(payload);
    });

    it('expands project directory placeholders and preserves env vars', async () => {
      const envCaptureFile = 'env-capture.json';
      const commandPath = 'hooks/env-check.cjs';
      writeHookScript(
        commandPath,
        `
const fs = require('node:fs');
const payload = {
  gemini: process.env.GEMINI_PROJECT_DIR,
  claude: process.env.CLAUDE_PROJECT_DIR,
  cwd: process.cwd(),
};
fs.writeFileSync(${JSON.stringify(envCaptureFile)}, JSON.stringify(payload));
console.log(JSON.stringify({ decision: 'allow' }));
`,
      );

      const config: HookConfig = {
        type: HookType.Command,
        command: `$GEMINI_PROJECT_DIR/${commandPath}`,
      };

      const result = await hookRunner.executeHook(
        config,
        HookEventName.BeforeTool,
        createInput(),
      );

      expect(result.success).toBe(true);
      const envData = JSON.parse(readProjectFile(envCaptureFile));
      const normalize = (value: string): string => realpathSync(value);
      const projectDirReal = realpathSync(projectDir);
      expect(normalize(envData.gemini)).toBe(projectDirReal);
      expect(normalize(envData.claude)).toBe(projectDirReal);
      expect(normalize(envData.cwd)).toBe(projectDirReal);
    });

    it('escapes cwd when expanding commands on POSIX platforms', () => {
      const cwdWithQuotes = "/tmp/project with 'quotes' && rm -rf /";
      const runner = new HookRunner({ platformOverride: 'linux' });
      const expanded = (
        runner as unknown as {
          expandCommand(command: string, input: HookInput): string;
        }
      ).expandCommand('$GEMINI_PROJECT_DIR/run.sh', {
        ...baseInput,
        cwd: cwdWithQuotes,
      });

      expect(expanded).toBe(
        "'/tmp/project with '\\''quotes'\\'' && rm -rf /'/run.sh",
      );
    });

    it('escapes cwd when expanding commands on Windows', () => {
      const cwdWithQuotes =
        'C\\\\project with "quotes" && del C\\\\windows\\system32';
      const runner = new HookRunner({ platformOverride: 'win32' });
      const expanded = (
        runner as unknown as {
          expandCommand(command: string, input: HookInput): string;
        }
      ).expandCommand('$GEMINI_PROJECT_DIR/cleanup.cmd', {
        ...baseInput,
        cwd: cwdWithQuotes,
      });

      expect(expanded).toBe(
        '& \'C\\project with "quotes" && del C\\windows\\system32\\cleanup.cmd\'',
      );

      const psRunner = new HookRunner({ platformOverride: 'win32' });

      const cwdWithSingleQuotes =
        "C\\\\project with 'quotes' && del C\\\\windows\\system32";

      const psExpanded = (
        psRunner as unknown as {
          expandCommand(command: string, input: HookInput): string;
        }
      ).expandCommand('$GEMINI_PROJECT_DIR/cleanup.cmd', {
        ...baseInput,
        cwd: cwdWithSingleQuotes,
      });

      expect(psExpanded).toBe(
        "& 'C\\project with ''quotes'' && del C\\windows\\system32\\cleanup.cmd'",
      );
    });
  });

  describe('executeHooksParallel', () => {
    it('runs hooks in parallel and collects results', async () => {
      const successScript = writeHookScript(
        'hooks/parallel-success.cjs',
        `console.log(JSON.stringify({ decision: 'allow' }));`,
      );
      const warnScript = writeHookScript(
        'hooks/parallel-warn.cjs',
        `console.error('warn'); process.exit(1);`,
      );

      const results = await hookRunner.executeHooksParallel(
        [
          { type: HookType.Command, command: successScript },
          { type: HookType.Command, command: warnScript },
        ],
        HookEventName.BeforeTool,
        createInput(),
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });

  describe('executeHooksSequential', () => {
    it('propagates additional context between BeforeAgent hooks', async () => {
      const contextHook = writeHookScript(
        'hooks/context.cjs',
        `
const payload = {
  decision: 'allow',
  hookSpecificOutput: { additionalContext: 'Context from hook 1' },
};
console.log(JSON.stringify(payload));
`,
      );

      const recorder = writeHookScript(
        'hooks/record.cjs',
        `
const fs = require('node:fs');
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString();
}
(async () => {
  const input = await readStdin();
  fs.writeFileSync('second-hook-input.json', input);
  console.log(JSON.stringify({ decision: 'allow' }));
})();
`,
      );

      const configs: HookConfig[] = [
        { type: HookType.Command, command: contextHook },
        { type: HookType.Command, command: recorder },
      ];

      const beforeAgentInput: BeforeAgentInput = {
        ...createInput({ hook_event_name: HookEventName.BeforeAgent }),
        prompt: 'Original prompt',
      };

      const results = await hookRunner.executeHooksSequential(
        configs,
        HookEventName.BeforeAgent,
        beforeAgentInput,
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      const recordedInput = JSON.parse(
        readProjectFile('second-hook-input.json'),
      );
      expect(recordedInput.prompt).toContain('Original prompt');
      expect(recordedInput.prompt).toContain('Context from hook 1');
    });

    it('merges LLM request fields for BeforeModel hooks', async () => {
      const llmModifier = writeHookScript(
        'hooks/llmModifier.cjs',
        `
const payload = {
  decision: 'allow',
  hookSpecificOutput: {
    llm_request: { temperature: 0.5 },
  },
};
console.log(JSON.stringify(payload));
`,
      );

      const recorder = writeHookScript(
        'hooks/model-record.cjs',
        `
const fs = require('node:fs');
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString();
}
(async () => {
  const input = await readStdin();
  fs.writeFileSync('second-model-input.json', input);
  console.log(JSON.stringify({ decision: 'allow' }));
})();
`,
      );

      const configs: HookConfig[] = [
        { type: HookType.Command, command: llmModifier },
        { type: HookType.Command, command: recorder },
      ];

      const beforeModelInput: BeforeModelInput = {
        ...createInput({ hook_event_name: HookEventName.BeforeModel }),
        llm_request: {
          model: 'gemini-1.5-pro',
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
      };

      await hookRunner.executeHooksSequential(
        configs,
        HookEventName.BeforeModel,
        beforeModelInput,
      );

      const recordedInput = JSON.parse(
        readProjectFile('second-model-input.json'),
      );
      expect(recordedInput.llm_request.model).toBe('gemini-1.5-pro');
      expect(recordedInput.llm_request.temperature).toBe(0.5);
    });

    it('does not propagate modifications when a hook fails', async () => {
      const failingHook = writeHookScript(
        'hooks/fail-first.cjs',
        `console.error('fail'); process.exit(1);`,
      );

      const recorder = writeHookScript(
        'hooks/record-original.cjs',
        `
const fs = require('node:fs');
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString();
}
(async () => {
  const input = await readStdin();
  fs.writeFileSync('unchanged-input.json', input);
  console.log(JSON.stringify({ decision: 'allow' }));
})();
`,
      );

      const configs: HookConfig[] = [
        { type: HookType.Command, command: failingHook },
        { type: HookType.Command, command: recorder },
      ];

      const beforeAgentInput: BeforeAgentInput = {
        ...createInput({ hook_event_name: HookEventName.BeforeAgent }),
        prompt: 'Base prompt',
      };

      const results = await hookRunner.executeHooksSequential(
        configs,
        HookEventName.BeforeAgent,
        beforeAgentInput,
      );

      expect(results[0].success).toBe(false);
      const recordedInput = JSON.parse(readProjectFile('unchanged-input.json'));
      expect(recordedInput.prompt).toBe('Base prompt');
    });
  });

  describe('cwd escaping integration', () => {
    it('runs hooks from directories containing quotes', async () => {
      const quotedDir = path.join(projectDir, "proj with 'quotes'");
      mkdirSync(quotedDir, { recursive: true });
      const scriptRelativePath = 'hooks/quoted.cjs';
      writeHookScript(
        scriptRelativePath,
        `console.log(JSON.stringify({ decision: 'allow' }));`,
        quotedDir,
      );

      const config: HookConfig = {
        type: HookType.Command,
        command: `$GEMINI_PROJECT_DIR/${scriptRelativePath}`,
      };

      const result = await hookRunner.executeHook(
        config,
        HookEventName.BeforeTool,
        createInput({ cwd: quotedDir }),
      );

      expect(result.success).toBe(true);
    });
  });
});
