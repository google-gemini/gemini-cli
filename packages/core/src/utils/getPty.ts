/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { spawn } from 'node:child_process';
import { quote } from 'shell-quote';
import { resolveExecutable } from './shell-utils.js';

export const GEMINI_PTY_BACKEND_ENV_VAR = 'GEMINI_PTY_BACKEND';

export type ConfiguredPtyBackend = 'external' | 'script' | 'proxy' | 'none';
export type ResolvedPtyBackend = 'native' | 'script' | 'proxy' | 'none';

type PtySpawnOptions = {
  cwd: string;
  cols: number;
  rows: number;
  env: Record<string, string | undefined>;
  name?: string;
  handleFlowControl?: boolean;
};

export interface PtyModule {
  spawn(file: string, args: string[], options: PtySpawnOptions): PtyProcess;
}

export type PtyImplementation = {
  module: PtyModule;
  name: 'lydell-node-pty' | 'node-pty' | 'script' | 'proxy';
} | null;

export interface PtyProcess {
  readonly pid: number;
  onData(callback: (data: string) => void): void;
  onExit(
    callback: (e: {
      exitCode: number;
      signal?: number | string | null;
    }) => void,
  ): void;
  write(data: string): void;
  kill(signal?: string): void;
  resize?(cols: number, rows: number): void;
  destroy?(): void;
}

function parseConfiguredPtyBackend(
  value: string | undefined,
): ConfiguredPtyBackend | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'external') {
    return 'external';
  }
  if (normalized === 'script') {
    return 'script';
  }
  if (normalized === 'proxy') {
    return 'proxy';
  }
  if (normalized === 'none') {
    return 'none';
  }

  return undefined;
}

function isPtyModule(module: unknown): module is PtyModule {
  return (
    typeof module === 'object' &&
    module !== null &&
    typeof (module as { spawn?: unknown }).spawn === 'function'
  );
}

async function getDefaultProxyExecutablePath(): Promise<string | undefined> {
  const exe = process.platform === 'win32' ? 'pty-proxy.exe' : 'pty-proxy';
  const candidatePaths = [
    path.resolve(process.cwd(), 'bundle', 'bin', exe),
    path.resolve(process.cwd(), 'bin', exe),
  ];

  for (const candidate of candidatePaths) {
    const resolved = await resolveExecutable(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return resolveExecutable(exe);
}

async function resolvePtyBackend(
  configuredBackend?: ConfiguredPtyBackend,
): Promise<ResolvedPtyBackend> {
  const backend =
    parseConfiguredPtyBackend(process.env[GEMINI_PTY_BACKEND_ENV_VAR]) ??
    configuredBackend;

  if (!backend) {
    return 'native';
  }

  if (backend === 'none') {
    return 'none';
  }

  const scriptPath = await resolveExecutable('script');
  const proxyPath = await getDefaultProxyExecutablePath();

  if (backend === 'script') {
    return scriptPath ? 'script' : 'none';
  }

  if (backend === 'proxy') {
    return proxyPath ? 'proxy' : 'none';
  }

  if (scriptPath) {
    return 'script';
  }

  if (proxyPath) {
    return 'proxy';
  }

  return 'none';
}

function createExternalPtyModule(backend: 'script' | 'proxy'): PtyModule {
  return {
    spawn(file: string, args: string[], options: PtySpawnOptions): PtyProcess {
      let command = file;
      let commandArgs = args;

      if (backend === 'script') {
        command = 'script';
        commandArgs = ['-qefc', quote([file, ...args]), '/dev/null'];
      }

      if (backend === 'proxy') {
        const explicitPath = process.env['GEMINI_PTY_PROXY_PATH'];
        command = explicitPath || 'pty-proxy';
        commandArgs = [file, ...args];
      }

      const child = spawn(command, commandArgs, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return {
        get pid() {
          return child.pid ?? -1;
        },
        onData(callback: (data: string) => void): void {
          child.stdout?.on('data', (chunk: Buffer | string) => {
            callback(chunk.toString());
          });
          child.stderr?.on('data', (chunk: Buffer | string) => {
            callback(chunk.toString());
          });
        },
        onExit(
          callback: (e: {
            exitCode: number;
            signal?: number | string | null;
          }) => void,
        ): void {
          child.once('exit', (code, signal) => {
            callback({ exitCode: code ?? 0, signal });
          });
        },
        write(data: string): void {
          child.stdin?.write(data);
        },
        kill(signal?: string): void {
          if (
            signal === 'SIGTERM' ||
            signal === 'SIGKILL' ||
            signal === 'SIGINT'
          ) {
            child.kill(signal);
            return;
          }
          child.kill();
        },
        resize(): void {
          // No-op for external wrappers that do not expose resize.
        },
        destroy(): void {
          child.stdin?.destroy();
          child.stdout?.destroy();
          child.stderr?.destroy();
        },
      };
    },
  };
}

export async function resolveConfiguredPtyBackend(
  configuredBackendValue?: string,
): Promise<ResolvedPtyBackend> {
  return resolvePtyBackend(parseConfiguredPtyBackend(configuredBackendValue));
}

export const getPty = async (options?: {
  configuredBackend?: string;
}): Promise<PtyImplementation> => {
  if (process.env['GEMINI_PTY_INFO'] === 'child_process') {
    return null;
  }

  const selectedBackend = await resolveConfiguredPtyBackend(
    options?.configuredBackend,
  );

  if (selectedBackend === 'none') {
    return null;
  }

  if (selectedBackend === 'script' || selectedBackend === 'proxy') {
    return {
      module: createExternalPtyModule(selectedBackend),
      name: selectedBackend,
    };
  }

  try {
    const lydell = '@lydell/node-pty';
    const imported: unknown = await import(lydell);
    if (isPtyModule(imported)) {
      return {
        module: imported,
        name: 'lydell-node-pty',
      };
    }
  } catch (_e) {
    // Ignore and continue to node-pty fallback.
  }

  try {
    const nodePty = 'node-pty';
    const imported: unknown = await import(nodePty);
    if (isPtyModule(imported)) {
      return { module: imported, name: 'node-pty' };
    }
  } catch (_e2) {
    // Ignore and return null below.
  }

  return null;
};
