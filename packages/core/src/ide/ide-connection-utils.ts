/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { EnvHttpProxyAgent } from 'undici';
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

export async function getConnectionConfigFromFile(
  pid: number,
): Promise<
  (ConnectionConfig & { workspacePath?: string; ideInfo?: IdeInfo }) | undefined
> {
  // For backwards compatibility
  try {
    const portFile = path.join(
      os.tmpdir(),
      'gemini',
      'ide',
      `gemini-ide-server-${pid}.json`,
    );
    const portFileContents = await fs.promises.readFile(portFile, 'utf8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(portFileContents);
  } catch (_) {
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
    return undefined;
  }

  if (!portFiles) {
    return undefined;
  }

  const matchingFiles = portFiles.filter((file) =>
    IDE_SERVER_FILE_REGEX.test(file),
  );

  if (matchingFiles.length === 0) {
    return undefined;
  }

  sortConnectionFiles(matchingFiles, pid);

  let fileContents: string[];
  try {
    fileContents = await Promise.all(
      matchingFiles.map((file) =>
        fs.promises.readFile(path.join(portFileDir, file), 'utf8'),
      ),
    );
  } catch (e) {
    logger.debug('Failed to read IDE connection config file(s):', e);
    return undefined;
  }
  const parsedContents = fileContents.map((content) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(content);
    } catch (e) {
      logger.debug('Failed to parse JSON from config file: ', e);
      return undefined;
    }
  });

  const validWorkspaces = parsedContents.filter((content) => {
    if (!content) {
      return false;
    }
    const { isValid } = validateWorkspacePath(
      content.workspacePath,
      process.cwd(),
    );
    return isValid;
  });

  if (validWorkspaces.length === 0) {
    return undefined;
  }

  if (validWorkspaces.length === 1) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const selected = validWorkspaces[0];
    const fileIndex = parsedContents.indexOf(selected);
    if (fileIndex !== -1) {
      logger.debug(`Selected IDE connection file: ${matchingFiles[fileIndex]}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return selected;
  }

  const portFromEnv = getPortFromEnv();
  if (portFromEnv) {
    const matchingPortIndex = validWorkspaces.findIndex(
      (content) => String(content.port) === portFromEnv,
    );
    if (matchingPortIndex !== -1) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const selected = validWorkspaces[matchingPortIndex];
      const fileIndex = parsedContents.indexOf(selected);
      if (fileIndex !== -1) {
        logger.debug(
          `Selected IDE connection file (matched port from env): ${matchingFiles[fileIndex]}`,
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return selected;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const selected = validWorkspaces[0];
  const fileIndex = parsedContents.indexOf(selected);
  if (fileIndex !== -1) {
    logger.debug(
      `Selected first valid IDE connection file: ${matchingFiles[fileIndex]}`,
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return selected;
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
  const undiciPromise = import('undici');
  // Suppress unhandled rejection if the promise is not awaited immediately.
  // If the import fails, the error will be thrown when awaiting undiciPromise below.
  undiciPromise.catch(() => {});
  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const { fetch: fetchFn } = await undiciPromise;
    const fetchOptions: RequestInit & { dispatcher?: unknown } = {
      ...init,
      dispatcher: agent,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const options = fetchOptions as unknown as import('undici').RequestInit;
    try {
      const response = await fetchFn(url, options);
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
