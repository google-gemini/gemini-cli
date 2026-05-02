/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration test for the SEA fork() detection fix.
 *
 * Reproduces the bug that node-pty's `_getConsoleProcessList()` triggers when
 * cleaning up a Windows ConPTY: it calls `child_process.fork('conpty_console_list_agent', [pid])`
 * which uses `process.execPath` as the Node.js interpreter. In a SEA build,
 * `process.execPath` is the gemini binary, so a second gemini session would
 * spawn instead of running the helper script.
 *
 * Usage:
 *   node sea/sea-launch.fork.integration.test.js <path-to-gemini.exe>
 *
 * Exit codes:
 *   0 = PASS (helper script ran via fork(), bug is fixed)
 *   1 = FAIL (no IPC message received, bug is present)
 *   2 = USAGE error
 */

const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const TIMEOUT_MS = 15_000;

const binaryPath = process.argv[2];
if (!binaryPath) {
  console.error('Usage: node sea-launch.fork.integration.test.js <path-to-binary>');
  process.exit(2);
}
if (!fs.existsSync(binaryPath)) {
  console.error(`ERROR: binary not found at ${binaryPath}`);
  process.exit(2);
}

// Create a tiny helper script in a unique tmp file. node-pty's real helper
// (conpty_console_list_agent.js) does the same shape: read argv[2] as a PID,
// do work, send result back via IPC, exit.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sea-fork-test-'));
const helperPath = path.join(tmpDir, 'fake_console_list_agent.js');
fs.writeFileSync(
  helperPath,
  `// Fake helper that mimics conpty_console_list_agent's IPC contract.
const shellPid = parseInt(process.argv[2], 10);
process.send({ status: 'ok', receivedShellPid: shellPid, runtimePid: process.pid });
process.exit(0);
`,
);

console.log(`[integration-test] Binary: ${binaryPath}`);
console.log(`[integration-test] Helper: ${helperPath}`);
console.log(`[integration-test] Timeout: ${TIMEOUT_MS}ms`);
console.log('');

const startedAt = Date.now();

// fork() with execPath = binary — exactly what @lydell/node-pty's
// `windowsPtyAgent._getConsoleProcessList()` does when cleaning up a ConPTY.
const child = fork(helperPath, ['129984'], {
  execPath: binaryPath,
  // Silence the child's stdout/stderr so we don't see the second-gemini banner
  // in the BEFORE case; we still get the IPC channel for `message` events.
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});

let stdoutBuf = '';
let stderrBuf = '';
child.stdout?.on('data', (d) => {
  stdoutBuf += d.toString();
});
child.stderr?.on('data', (d) => {
  stderrBuf += d.toString();
});

let messageReceived = null;
let exitInfo = null;
let errorInfo = null;

let timeoutHandle = null;
let finished = false;

function finish() {
  if (finished) return;
  finished = true;
  if (timeoutHandle) clearTimeout(timeoutHandle);
  const elapsedMs = Date.now() - startedAt;

  console.log(`[integration-test] elapsed=${elapsedMs}ms`);
  console.log(`[integration-test] message: ${JSON.stringify(messageReceived)}`);
  console.log(`[integration-test] exit:    ${JSON.stringify(exitInfo)}`);
  console.log(`[integration-test] error:   ${JSON.stringify(errorInfo)}`);
  if (stdoutBuf) console.log(`[integration-test] child-stdout:\n${stdoutBuf.slice(0, 500)}`);
  if (stderrBuf) console.log(`[integration-test] child-stderr:\n${stderrBuf.slice(0, 500)}`);

  const ok =
    messageReceived &&
    messageReceived.status === 'ok' &&
    messageReceived.receivedShellPid === 129984;

  // Cleanup
  if (!child.killed && exitInfo === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }
  try {
    fs.unlinkSync(helperPath);
    fs.rmdirSync(tmpDir);
  } catch {
    /* ignore */
  }

  if (ok) {
    console.log('');
    console.log('RESULT: PASS — fork()\'d helper script ran and sent IPC message.');
    console.log('        The SEA fork-detection fix is working.');
    process.exit(0);
  } else {
    console.log('');
    console.log('RESULT: FAIL — fork()\'d helper did NOT respond via IPC.');
    console.log('        The bug is present: a second gemini session is starting');
    console.log('        instead of running the helper script.');
    process.exit(1);
  }
}

child.on('message', (msg) => {
  messageReceived = msg;
  // Got the expected IPC message — finish immediately (success path).
  setImmediate(finish);
});
child.on('exit', (code, signal) => {
  exitInfo = { code, signal };
  // Child exited without IPC message — give a small grace period for any
  // pending message to arrive, then finish.
  setTimeout(finish, 100);
});
child.on('error', (err) => {
  errorInfo = { message: err.message, code: err.code };
});

timeoutHandle = setTimeout(finish, TIMEOUT_MS);
