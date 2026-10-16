/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';
import { debugLogger } from '../utils/debugLogger.js';
import { isSubpath, resolveToRealPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import { type IdeInfo } from './detect-ide.js';

const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) =>
    debugLogger.debug('[DEBUG] [IDEConnectionUtils]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) =>
    debugLogger.error('[ERROR] [IDEConnectionUtils]', ...args),
};

export type StdioConfig = {
  command: string;
  args: string[];
};

export type ConnectionConfig = {
  port?: string;
  authToken?: string;
  stdio?: StdioConfig;
};

/** A connection config as written to a port file by the IDE companion. */
export type IdeConnectionConfig = ConnectionConfig & {
  workspacePath?: string;
  ideInfo?: IdeInfo;
};

export function validateWorkspacePath(
  ideWorkspacePath: string | undefined,
  cwd: string,
): { isValid: boolean; error?: string } {
  if (ideWorkspacePath === undefined) {
    return {
      isValid: false,
      error: `Failed to connect to IDE companion extension. Please ensure the extension is running. To install the extension, run /ide install.`,
    };
  }

  if (ideWorkspacePath === '') {
    return {
      isValid: false,
      error: `To use this feature, please open a workspace folder in your IDE and try again.`,
    };
  }

  const ideWorkspacePaths = ideWorkspacePath
    .split(path.delimiter)
    .map((p) => resolveToRealPath(p))
    .filter((e) => !!e);
  const realCwd = resolveToRealPath(cwd);
  const isWithinWorkspace = ideWorkspacePaths.some((workspacePath) =>
    isSubpath(workspacePath, realCwd),
  );

  if (!isWithinWorkspace) {
    return {
      isValid: false,
      error: `Directory mismatch. Gemini CLI is running in a different location than the open workspace in the IDE. Please run the CLI from one of the following directories: ${ideWorkspacePaths.join(
        ', ',
      )}`,
    };
  }
  return { isValid: true };
}

export function getPortFromEnv(): string | undefined {
  const port = process.env['GEMINI_CLI_IDE_SERVER_PORT'];
  if (!port) {
    return undefined;
  }
  return port;
}

export function getStdioConfigFromEnv(): StdioConfig | undefined {
  const command = process.env['GEMINI_CLI_IDE_SERVER_STDIO_COMMAND'];
  if (!command) {
    return undefined;
  }

  const argsStr = process.env['GEMINI_CLI_IDE_SERVER_STDIO_ARGS'];
  let args: string[] = [];
  if (argsStr) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsedArgs = JSON.parse(argsStr);
      if (Array.isArray(parsedArgs)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        args = parsedArgs;
      } else {
        logger.error(
          'GEMINI_CLI_IDE_SERVER_STDIO_ARGS must be a JSON array string.',
        );
      }
    } catch (e) {
      logger.error('Failed to parse GEMINI_CLI_IDE_SERVER_STDIO_ARGS:', e);
    }
  }

  return { command, args };
}

const IDE_SERVER_FILE_REGEX = /^gemini-ide-server-(\d+)-\d+\.json$/;

async function verifyAndReadFile(
  filePath: string,
): Promise<string | undefined> {
  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const stat = await handle.stat();
    if (process.getuid && stat.uid !== process.getuid()) {
      return undefined;
    }
    return await handle.readFile('utf8');
  } catch {
    return undefined;
  } finally {
    if (handle) {
      await handle.close();
    }
  }
}

/**
 * Returns the best connection config discovered for `pid`, if any.
 *
 * Prefer {@link getConnectionConfigsFromFile} when actually connecting: a port
 * file can outlive its server, so the best-ranked candidate is not necessarily
 * a live one.
 */
export async function getConnectionConfigFromFile(
  pid: number,
): Promise<IdeConnectionConfig | undefined> {
  return (await getConnectionConfigsFromFile(pid))[0];
}

/**
 * Returns every connection config discovered for `pid`, best candidate first.
 *
 * More than one file can describe the current workspace: all windows of one
 * IDE instance share the same parent pid, and a file is left behind whenever
 * an extension host is killed before it can clean up (e.g. VS Code's
 * "Reload Window" with an older companion). Callers should try the candidates
 * in order and move on when one does not answer.
 *
 * Ordering:
 * 1. the file whose port matches `GEMINI_CLI_IDE_SERVER_PORT` — the window the
 *    terminal was created in — if any;
 * 2. the remaining files that match the current workspace, in
 *    {@link sortConnectionFiles} order.
 *
 * When no file matches the current workspace, a single best-sorted entry is
 * returned so that downstream logic can raise the detailed "Directory
 * mismatch" error instead of a generic connection error.
 */
export async function getConnectionConfigsFromFile(
  pid: number,
): Promise<IdeConnectionConfig[]> {
  // For backwards compatibility
  try {
    const portFile = path.join(
      os.tmpdir(),
      'gemini',
      'ide',
      `gemini-ide-server-${pid}.json`,
    );
    const portFileContents = await verifyAndReadFile(portFile);
    if (!portFileContents) {
      throw new Error('Verification failed or file not found');
    }
    const parsed: unknown = JSON.parse(portFileContents);
    const isConfig = (val: unknown): val is IdeConnectionConfig =>
      typeof val === 'object' && val !== null;
    if (isConfig(parsed)) {
      return [parsed];
    }
    throw new Error('Invalid connection config format');
  } catch {
    // For newer extension versions, the file name matches the pattern
    // /^gemini-ide-server-${pid}-\d+\.json$/. If multiple IDE
    // windows are open, multiple files matching the pattern are expected to
    // exist.
  }

  const portFileDir = path.join(os.tmpdir(), 'gemini', 'ide');
  let portFiles;
  try {
    portFiles = await fs.promises.readdir(portFileDir);
  } catch (e) {
    logger.debug('Failed to read IDE connection directory:', e);
    return [];
  }

  if (!portFiles) {
    return [];
  }

  const matchingFiles = portFiles.filter((file) =>
    IDE_SERVER_FILE_REGEX.test(file),
  );

  if (matchingFiles.length === 0) {
    return [];
  }

  sortConnectionFiles(matchingFiles, pid);

  const fileContents = await Promise.all(
    matchingFiles.map((file) =>
      verifyAndReadFile(path.join(portFileDir, file)),
    ),
  );

  const parsedContents = fileContents.map(
    (content): IdeConnectionConfig | undefined => {
      if (!content) {
        return undefined;
      }
      try {
        const parsed: unknown = JSON.parse(content);
        const isConfig = (val: unknown): val is IdeConnectionConfig =>
          typeof val === 'object' && val !== null;
        if (isConfig(parsed)) {
          return parsed;
        }
        return undefined;
      } catch (e) {
        logger.debug('Failed to parse JSON from config file: ', e);
        return undefined;
      }
    },
  );

  const validWorkspaces = parsedContents.filter(
    (content): content is IdeConnectionConfig => {
      if (!content) {
        return false;
      }
      const { isValid } = validateWorkspacePath(
        content.workspacePath,
        process.cwd(),
      );
      return isValid;
    },
  );

  const portFromEnv = getPortFromEnv();
  const matchesEnvPort = (content: IdeConnectionConfig | undefined) =>
    !!content &&
    content.port !== undefined &&
    String(content.port) === portFromEnv;

  if (validWorkspaces.length === 0) {
    // If no workspace matches the current CWD, but we found and parsed
    // valid connection config file(s), return the best-sorted config.
    // This lets downstream connection logic raise a helpful, detailed
    // "Directory mismatch" warning instead of a generic connection error.
    let fileIndex = -1;
    if (portFromEnv) {
      fileIndex = parsedContents.findIndex(matchesEnvPort);
    }
    if (fileIndex === -1) {
      fileIndex = parsedContents.findIndex((content) => !!content);
    }

    if (fileIndex !== -1) {
      const selected = parsedContents[fileIndex]!;
      logger.debug(
        `Selected best mismatched IDE connection file: ${matchingFiles[fileIndex]}`,
      );
      return [selected];
    }
    return [];
  }

  const candidates = [...validWorkspaces];
  if (portFromEnv) {
    const matchingPortIndex = candidates.findIndex(matchesEnvPort);
    if (matchingPortIndex > 0) {
      candidates.unshift(...candidates.splice(matchingPortIndex, 1));
    }
  }

  logger.debug(
    `IDE connection candidates (in order): ${candidates
      .map((candidate) => matchingFiles[parsedContents.indexOf(candidate)])
      .join(', ')}`,
  );
  return candidates;
}

// Sort files to prioritize the one matching the target pid,
// then by whether the process is still alive, then by newest (largest PID).
function sortConnectionFiles(files: string[], targetPid: number) {
  files.sort((a, b) => {
    const aMatch = a.match(IDE_SERVER_FILE_REGEX);
    const bMatch = b.match(IDE_SERVER_FILE_REGEX);
    const aPid = aMatch ? parseInt(aMatch[1], 10) : 0;
    const bPid = bMatch ? parseInt(bMatch[1], 10) : 0;

    if (aPid === targetPid && bPid !== targetPid) {
      return -1;
    }
    if (bPid === targetPid && aPid !== targetPid) {
      return 1;
    }

    const aIsAlive = isPidAlive(aPid);
    const bIsAlive = isPidAlive(bPid);

    if (aIsAlive && !bIsAlive) {
      return -1;
    }
    if (bIsAlive && !aIsAlive) {
      return 1;
    }

    // Newest PIDs first as a heuristic
    return bPid - aPid;
  });
}

function isPidAlive(pid: number): boolean {
  if (pid <= 0) {
    return false;
  }
  // Assume the process is alive since checking would introduce significant overhead.
  if (os.platform() === 'win32') {
    return true;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return isNodeError(e) && e.code === 'EPERM';
  }
}

export async function createProxyAwareFetch(ideServerHost: string) {
  // ignore proxy for the IDE server host to allow connecting to the ide mcp server
  const existingNoProxy = process.env['NO_PROXY'] || '';
  const agent = new EnvHttpProxyAgent({
    noProxy: [existingNoProxy, ideServerHost].filter(Boolean).join(','),
  });
  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const fetchOptions: RequestInit & { dispatcher?: unknown } = {
      ...init,
      dispatcher: agent,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const options = fetchOptions as unknown as import('undici').RequestInit;
    try {
      const response = await undiciFetch(url, options);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return new Response(response.body as ReadableStream<unknown> | null, {
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()],
      });
    } catch (error) {
      const urlString = typeof url === 'string' ? url : url.href;
      logger.error(`IDE fetch failed for ${urlString}`, error);
      throw error;
    }
  };
}

export function getIdeServerHost() {
  let host: string;
  host = '127.0.0.1';
  if (isInContainer()) {
    // when ssh-connection (e.g. remote-ssh) or devcontainer setup:
    // --> host must be '127.0.0.1' to have cli companion working
    if (!isSshConnected() && !isDevContainer()) {
      host = 'host.docker.internal';
    }
  }
  logger.debug(`[getIdeServerHost] Mapping IdeServerHost to '${host}'`);
  return host;
}

function isInContainer() {
  return fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
}

function isSshConnected() {
  return !!process.env['SSH_CONNECTION'];
}

function isDevContainer() {
  return !!(
    process.env['VSCODE_REMOTE_CONTAINERS_SESSION'] ||
    process.env['REMOTE_CONTAINERS']
  );
}
