/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Visual demo for the `stream_output` plumbing (issue #25803).
 *
 * Spawns a real background process that prints 5 lines with 1s spacing,
 * subscribes to ExecutionLifecycleService exactly the way shell.ts's
 * stream_output path does, and logs each line as it arrives — so you can
 * *see* the live-forwarding in action without needing a full ACP client.
 *
 * Run from the repo root:
 *
 *   npx tsx scripts/demo-stream-output.ts
 *
 * Expected output (timing is real):
 *
 *   [00.0s] demo: subscribed to pid <n>
 *   [00.X s] live: line1
 *   [01.X s] live: line2
 *   [02.X s] live: line3
 *   [03.X s] live: line4
 *   [04.X s] live: line5
 *   [05.X s] demo: process exited, unsubscribed
 *
 * With stream_output OFF the agent would be blind to these events until
 * a user prompt arrived; with it ON each line is forwarded as an ACP
 * `tool_call_update(in_progress)` event the model can react to.
 */

import { ShellExecutionService } from '../packages/core/src/services/shellExecutionService.js';
import {
  ExecutionLifecycleService,
  type ExecutionOutputEvent,
} from '../packages/core/src/services/executionLifecycleService.js';
import { LineBuffer } from '../packages/core/src/utils/lineBuffer.js';
import { NoopSandboxManager } from '../packages/core/src/services/sandboxManager.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Use a node script rather than shell one-liners so this demo works
// identically on Windows (cmd.exe) / macOS / Linux.
const scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-demo-'));
const scriptPath = path.join(scriptDir, 'emit.js');
fs.writeFileSync(
  scriptPath,
  `
  (async () => {
    for (let i = 1; i <= 5; i++) {
      console.log('line' + i);
      await new Promise((r) => setTimeout(r, 1000));
    }
  })();
  `,
);
const command = `node "${scriptPath}"`;

const startTime = Date.now();
const ts = () =>
  `[${((Date.now() - startTime) / 1000).toFixed(1).padStart(4, '0')}s]`;

async function main() {
  const controller = new AbortController();
  const lineBuffer = new LineBuffer();

  console.log(`${ts()} demo: launching: ${command}`);

  const handle = await ShellExecutionService.execute(
    command,
    process.cwd(),
    () => {
      /* no-op — we observe via ExecutionLifecycleService */
    },
    controller.signal,
    false, // child_process path; PTY mode emits AnsiOutput which stream_output skips
    {
      originalCommand: 'demo',
      sessionId: 'demo-session',
      sanitizationConfig: {
        allowedEnvironmentVariables: [],
        blockedEnvironmentVariables: [],
        enableEnvironmentVariableRedaction: false,
      },
      sandboxManager: new NoopSandboxManager(),
    },
  );

  const pid = handle.pid;
  if (pid === undefined) {
    console.error('demo: failed to obtain pid');
    process.exit(1);
  }

  console.log(`${ts()} demo: subscribed to pid ${pid}`);

  const exited = new Promise<void>((resolve) => {
    const unsubscribe = ExecutionLifecycleService.subscribe(
      pid,
      (event: ExecutionOutputEvent) => {
        if (event.type === 'data' && typeof event.chunk === 'string') {
          for (const line of lineBuffer.push(event.chunk)) {
            console.log(`${ts()} live: ${line}`);
          }
        } else if (event.type === 'exit') {
          for (const trailing of lineBuffer.flush()) {
            console.log(`${ts()} live: ${trailing}`);
          }
          unsubscribe();
          console.log(`${ts()} demo: process exited, unsubscribed`);
          resolve();
        }
      },
    );
  });

  // Move to background — mirrors what the shell tool does at t = delay_ms.
  // This also causes handle.result to resolve early (handoff signal), so we
  // explicitly wait for the real process-exit event from the lifecycle bus.
  ShellExecutionService.background(pid, 'demo-session', 'demo');

  await exited;

  fs.rmSync(scriptDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error('demo: error', err);
  process.exit(1);
});
