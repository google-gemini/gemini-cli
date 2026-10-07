/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression tests for
 * https://github.com/google-gemini/gemini-cli/issues/21331
 *
 * Exercises the real HTTP connection path of `IdeClient.connect()` in the
 * environment the sandbox launcher creates inside a gVisor (runsc) container:
 * `TERM_PROGRAM`, `GEMINI_CLI_IDE_SERVER_PORT`, `GEMINI_CLI_IDE_WORKSPACE_PATH`
 * and `GEMINI_SANDBOX=runsc` are forwarded, but gVisor's isolated network stack
 * cannot reach the IDE companion server on the host, so every connection
 * attempt fails.
 *
 * The tests are hermetic: the unreachable companion is a refused loopback
 * port (no DNS, no Docker, no runsc needed) and `os.tmpdir()` points at an
 * empty directory so host discovery files cannot leak in.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { IdeClient, IDEConnectionStatus } from './ide-client.js';
import { getIdeProcessInfo } from './process-utils.js';

// Inside the sandbox the IDE process is not an ancestor of the CLI; the CLI
// only learns about the IDE through the environment variables forwarded by
// the sandbox launcher.
vi.mock('./process-utils.js', () => ({
  getIdeProcessInfo: vi.fn(),
}));

const GVISOR_MESSAGE =
  'gVisor (runsc) sandboxing isolates the container network stack, so the IDE companion server on the host is unreachable. To use IDE integration, run Gemini CLI without the runsc sandbox.';
const GENERIC_MESSAGE =
  'Please ensure the extension is running. To install the extension, run /ide install.';

/**
 * Returns a loopback port nothing is listening on. Connecting to it is refused
 * immediately, which is the same observable outcome the CLI gets under gVisor
 * when it tries to reach the companion on the host.
 */
async function getUnreachablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a loopback port'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function connectAndGetStatus() {
  const ideClient = await IdeClient.getInstance();
  await ideClient.connect({ logToConsole: false });
  return ideClient.getConnectionStatus();
}

describe('IdeClient inside a gVisor (runsc) sandbox', () => {
  let sandboxTmpDir: string;

  beforeEach(() => {
    (
      IdeClient as unknown as { instancePromise: Promise<IdeClient> | null }
    ).instancePromise = null;

    vi.mocked(getIdeProcessInfo).mockResolvedValue({
      pid: 1,
      command: '/sbin/docker-init -- bash',
    });

    // The host's $TMPDIR/gemini/ide discovery directory is not mounted into
    // the sandbox.
    sandboxTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-runsc-'));
    vi.stubEnv('TMPDIR', sandboxTmpDir);
    vi.stubEnv('TMP', sandboxTmpDir);
    vi.stubEnv('TEMP', sandboxTmpDir);

    // Environment forwarded by the sandbox launcher.
    vi.stubEnv('GEMINI_SANDBOX', 'runsc');
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', process.cwd());
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', undefined);
    vi.stubEnv('GEMINI_CLI_IDE_AUTH_TOKEN', undefined);
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_STDIO_COMMAND', undefined);
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_STDIO_ARGS', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    fs.rmSync(sandboxTmpDir, { recursive: true, force: true });
  });

  it('explains the gVisor network isolation when the companion is unreachable', async () => {
    vi.stubEnv(
      'GEMINI_CLI_IDE_SERVER_PORT',
      String(await getUnreachablePort()),
    );

    const { status, details } = await connectAndGetStatus();

    expect(status).toBe(IDEConnectionStatus.Disconnected);
    expect(details).toContain(GVISOR_MESSAGE);
    expect(details).not.toContain('/ide install');
  });

  it('explains the gVisor network isolation when no IDE connection details reach the sandbox', async () => {
    vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', undefined);

    const { status, details } = await connectAndGetStatus();

    expect(status).toBe(IDEConnectionStatus.Disconnected);
    expect(details).toContain(GVISOR_MESSAGE);
    expect(details).not.toContain('/ide install');
  });

  it('keeps the generic message outside gVisor when the companion is unreachable', async () => {
    vi.stubEnv('GEMINI_SANDBOX', 'docker');
    vi.stubEnv(
      'GEMINI_CLI_IDE_SERVER_PORT',
      String(await getUnreachablePort()),
    );

    const { status, details } = await connectAndGetStatus();

    expect(status).toBe(IDEConnectionStatus.Disconnected);
    expect(details).toContain(GENERIC_MESSAGE);
    expect(details).not.toContain('gVisor');
  });
});
