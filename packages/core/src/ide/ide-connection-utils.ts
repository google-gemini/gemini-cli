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
      const parsedArgs = JSON.parse(argsStr);
      if (Array.isArray(parsedArgs)) {
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

  const fileRegex = new RegExp(`^gemini-ide-server-${pid}-\\d+\\.json$`);
  const matchingFiles = portFiles.filter((file) => fileRegex.test(file)).sort();
  if (matchingFiles.length === 0) {
    return undefined;
  }

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
    return validWorkspaces[0];
  }

  const portFromEnv = getPortFromEnv();
  if (portFromEnv) {
    const matchingPort = validWorkspaces.find(
      (content) => String(content.port) === portFromEnv,
    );
    if (matchingPort) {
      return matchingPort;
    }
  }

  return validWorkspaces[0];
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
    const options = fetchOptions as unknown as import('undici').RequestInit;
    const response = await fetchFn(url, options);
    return new Response(response.body as ReadableStream<unknown> | null, {
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
    });
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
