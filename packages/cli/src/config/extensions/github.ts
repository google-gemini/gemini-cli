/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { simpleGit } from 'simple-git';
import {
  debugLogger,
  getErrorMessage,
  getSafeGitEnv,
  validateUrlDestination,
  type ExtensionInstallMetadata,
  type GeminiCLIExtension,
} from '@google/gemini-cli-core';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import * as crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import * as os from 'node:os';
import * as https from 'node:https';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import extract from 'extract-zip';
import {
  fetchJson,
  getGitHubToken,
  isTrustedGitHubUrl,
  lookupPublicAddress,
  REDIRECT_STATUS_CODES,
  REQUEST_TIMEOUT_MS,
} from './github_fetch.js';
import type { ExtensionConfig } from '../extension.js';
import type { ExtensionManager } from '../extension-manager.js';
import { EXTENSIONS_CONFIG_FILENAME } from './variables.js';

/**
 * Clones a Git repository to a specified local path.
 * @param installMetadata The metadata for the extension to install.
 * @param destination The destination path to clone the repository to.
 */
export async function cloneFromGit(
  installMetadata: ExtensionInstallMetadata,
  destination: string,
): Promise<void> {
  try {
    const git = simpleGit(destination).env(getSafeGitEnv());
    let sourceUrl = installMetadata.source;
    const token = getGitHubToken();
    if (token) {
      try {
        const parsedUrl = new URL(sourceUrl);
        if (
          parsedUrl.protocol === 'https:' &&
          parsedUrl.hostname === 'github.com'
        ) {
          if (!parsedUrl.username) {
            parsedUrl.username = token;
          }
          sourceUrl = parsedUrl.toString();
        }
      } catch {
        // If source is not a valid URL, we don't inject the token.
        // We let git handle the source as is.
      }
    }
    await git.clone(sourceUrl, './', ['--depth', '1']);

    const remotes = await git.getRemotes(true);
    if (remotes.length === 0) {
      throw new Error(
        `Unable to find any remotes for repo ${installMetadata.source}`,
      );
    }

    const refToFetch = installMetadata.ref || 'HEAD';

    await git.fetch(remotes[0].name, refToFetch);

    // After fetching, checkout FETCH_HEAD to get the content of the fetched ref.
    // This results in a detached HEAD state, which is fine for this purpose.
    await git.checkout('FETCH_HEAD');
  } catch (error) {
    throw new Error(
      `Failed to clone Git repository from ${installMetadata.source} ${getErrorMessage(error)}`,
      {
        cause: error,
      },
    );
  }
}

export interface GithubRepoInfo {
  owner: string;
  repo: string;
}

export function tryParseGithubUrl(source: string): GithubRepoInfo | null {
  // Handle SCP-style SSH URLs.
  if (source.startsWith('git@')) {
    if (source.startsWith('git@github.com:')) {
      // It's a GitHub SSH URL, so normalize it for the URL parser.
      source = source.replace('git@github.com:', '');
    } else {
      // It's another provider's SSH URL (e.g., gitlab), so not a GitHub repo.
      return null;
    }
  }
  // Default to a github repo path, so `source` can be just an org/repo
  let parsedUrl: URL;
  try {
    // Use the standard URL constructor for backward compatibility.
    parsedUrl = new URL(source, 'https://github.com');
  } catch (e) {
    // Throw a TypeError to maintain a consistent error contract for invalid URLs.
    // This avoids a breaking change for consumers who might expect a TypeError.
    throw new TypeError(`Invalid repo URL: ${source}`, { cause: e });
  }

  if (!parsedUrl) {
    throw new Error(`Invalid repo URL: ${source}`);
  }
  if (parsedUrl?.host !== 'github.com') {
    return null;
  }
  // The pathname should be "/owner/repo".
  const parts = parsedUrl?.pathname
    .split('/')
    // Remove the empty segments, fixes trailing and leading slashes
    .filter((part) => part !== '');

  if (parts?.length !== 2) {
    throw new Error(
      `Invalid GitHub repository source: ${source}. Expected "owner/repo" or a github repo uri.`,
    );
  }
  const owner = parts[0];
  // Only strip a trailing `.git` suffix (case-insensitive) so names that
  // contain `.git` elsewhere, e.g. `blog.github.io`, are preserved.
  const repo = parts[1].replace(/\.git$/i, '');

  return {
    owner,
    repo,
  };
}

export async function fetchReleaseFromGithub(
  owner: string,
  repo: string,
  ref?: string,
  allowPreRelease?: boolean,
): Promise<GithubReleaseData | null> {
  if (ref) {
    return fetchJson(
      `https://api.github.com/repos/${owner}/${repo}/releases/tags/${ref}`,
    );
  }

  if (!allowPreRelease) {
    // Grab the release that is tagged as the "latest", github does not allow
    // this to be a pre-release so we can blindly grab it.
    try {
      return await fetchJson(
        `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
      );
    } catch {
      // This can fail if there is no release marked latest. In that case
      // we want to just try the pre-release logic below.
    }
  }

  // If pre-releases are allowed, we just grab the most recent release.
  const releases = await fetchJson<GithubReleaseData[]>(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=1`,
  );
  if (releases.length === 0) {
    return null;
  }
  return releases[0];
}

export async function checkForExtensionUpdate(
  extension: GeminiCLIExtension,
  extensionManager: ExtensionManager,
): Promise<ExtensionUpdateState> {
  const installMetadata = extension.installMetadata;
  if (installMetadata?.type === 'local') {
    let latestConfig: ExtensionConfig | undefined;
    try {
      latestConfig = await extensionManager.loadExtensionConfig(
        installMetadata.source,
      );
    } catch (e) {
      debugLogger.warn(
        `Failed to check for update for local extension "${extension.name}". Could not load extension from source path: ${installMetadata.source}. Error: ${getErrorMessage(e)}`,
      );
      return ExtensionUpdateState.NOT_UPDATABLE;
    }

    if (!latestConfig) {
      debugLogger.warn(
        `Failed to check for update for local extension "${extension.name}". Could not load extension from source path: ${installMetadata.source}`,
      );
      return ExtensionUpdateState.NOT_UPDATABLE;
    }
    if (latestConfig.version !== extension.version) {
      return ExtensionUpdateState.UPDATE_AVAILABLE;
    }
    return ExtensionUpdateState.UP_TO_DATE;
  }
  if (
    !installMetadata ||
    (installMetadata.type !== 'git' &&
      installMetadata.type !== 'github-release')
  ) {
    return ExtensionUpdateState.NOT_UPDATABLE;
  }

  if (extension.migratedTo) {
    const migratedState = await checkForExtensionUpdate(
      {
        ...extension,
        installMetadata: { ...installMetadata, source: extension.migratedTo },
        migratedTo: undefined,
      },
      extensionManager,
    );
    if (
      migratedState === ExtensionUpdateState.UPDATE_AVAILABLE ||
      migratedState === ExtensionUpdateState.UP_TO_DATE
    ) {
      return ExtensionUpdateState.UPDATE_AVAILABLE;
    }
  }

  try {
    if (installMetadata.type === 'git') {
      const git = simpleGit(extension.path).env(getSafeGitEnv());
      const remotes = await git.getRemotes(true);
      if (remotes.length === 0) {
        debugLogger.error('No git remotes found.');
        return ExtensionUpdateState.ERROR;
      }
      const remoteUrl = remotes[0].refs.fetch;
      if (!remoteUrl) {
        debugLogger.error(
          `No fetch URL found for git remote ${remotes[0].name}.`,
        );
        return ExtensionUpdateState.ERROR;
      }

      // Determine the ref to check on the remote.
      const refToCheck = installMetadata.ref || 'HEAD';

      const lsRemoteOutput = await git.listRemote([remoteUrl, refToCheck]);

      if (typeof lsRemoteOutput !== 'string' || lsRemoteOutput.trim() === '') {
        debugLogger.error(`Git ref ${refToCheck} not found.`);
        return ExtensionUpdateState.ERROR;
      }

      const remoteHash = lsRemoteOutput.split('\t')[0];
      const localHash = await git.revparse(['HEAD']);

      if (!remoteHash) {
        debugLogger.error(
          `Unable to parse hash from git ls-remote output "${lsRemoteOutput}"`,
        );
        return ExtensionUpdateState.ERROR;
      }
      if (remoteHash === localHash) {
        return ExtensionUpdateState.UP_TO_DATE;
      }
      return ExtensionUpdateState.UPDATE_AVAILABLE;
    } else {
      const { source, releaseTag } = installMetadata;
      if (!source) {
        debugLogger.error(`No "source" provided for extension.`);
        return ExtensionUpdateState.ERROR;
      }
      const repoInfo = tryParseGithubUrl(source);
      if (!repoInfo) {
        debugLogger.error(
          `Source is not a valid GitHub repository for release checks: ${source}`,
        );
        return ExtensionUpdateState.ERROR;
      }
      const { owner, repo } = repoInfo;

      const releaseData = await fetchReleaseFromGithub(
        owner,
        repo,
        installMetadata.ref,
        installMetadata.allowPreRelease,
      );
      if (!releaseData) {
        return ExtensionUpdateState.ERROR;
      }
      if (releaseData.tag_name !== releaseTag) {
        return ExtensionUpdateState.UPDATE_AVAILABLE;
      }
      return ExtensionUpdateState.UP_TO_DATE;
    }
  } catch (error) {
    debugLogger.error(
      `Failed to check for updates for extension "${installMetadata.source}": ${getErrorMessage(error)}`,
    );
    return ExtensionUpdateState.ERROR;
  }
}

export type GitHubDownloadResult =
  | {
      tagName?: string;
      type: 'git' | 'github-release';
      success: false;
      failureReason:
        | 'failed to fetch release data'
        | 'no release data'
        | 'no release asset found'
        | 'failed to download asset'
        | 'failed to extract asset'
        | 'unknown';
      errorMessage: string;
    }
  | {
      tagName?: string;
      type: 'git' | 'github-release';
      success: true;
    };
export async function downloadFromGitHubRelease(
  installMetadata: ExtensionInstallMetadata,
  destination: string,
  githubRepoInfo: GithubRepoInfo,
): Promise<GitHubDownloadResult> {
  const { ref, allowPreRelease: preRelease } = installMetadata;
  const { owner, repo } = githubRepoInfo;
  let releaseData: GithubReleaseData | null = null;

  try {
    try {
      releaseData = await fetchReleaseFromGithub(owner, repo, ref, preRelease);
      if (!releaseData) {
        return {
          failureReason: 'no release data',
          success: false,
          type: 'github-release',
          errorMessage: `No release data found for ${owner}/${repo} at tag ${ref}`,
        };
      }
    } catch (error) {
      return {
        failureReason: 'failed to fetch release data',
        success: false,
        type: 'github-release',
        errorMessage: `Failed to fetch release data for ${owner}/${repo} at tag ${ref}: ${getErrorMessage(error)}`,
      };
    }

    const asset = findReleaseAsset(releaseData.assets);
    let archiveUrl: string | undefined;
    let isTar = false;
    let isZip = false;
    let fileName: string | undefined;

    if (asset) {
      archiveUrl = asset.url;
      fileName = asset.name;
    } else {
      if (releaseData.tarball_url) {
        archiveUrl = releaseData.tarball_url;
        isTar = true;
      } else if (releaseData.zipball_url) {
        archiveUrl = releaseData.zipball_url;
        isZip = true;
      }
    }
    if (!archiveUrl) {
      return {
        failureReason: 'no release asset found',
        success: false,
        type: 'github-release',
        tagName: releaseData.tag_name,
        errorMessage: `No assets found for release with tag ${releaseData.tag_name}`,
      };
    }
    if (!fileName) {
      fileName = path.basename(new URL(archiveUrl).pathname);
    }
    let downloadedAssetPath = path.join(destination, fileName);
    if (isTar && !downloadedAssetPath.endsWith('.tar.gz')) {
      downloadedAssetPath += '.tar.gz';
    } else if (isZip && !downloadedAssetPath.endsWith('.zip')) {
      downloadedAssetPath += '.zip';
    }

    try {
      // GitHub API requires different Accept headers for different types of downloads:
      // 1. Binary Assets (e.g. release artifacts): Require 'application/octet-stream' to return the raw content.
      // 2. Source Tarballs (e.g. /tarball/{ref}): Require 'application/vnd.github+json' (or similar) to return
      //    a 302 Redirect to the actual download location (codeload.github.com).
      //    Sending 'application/octet-stream' for tarballs results in a 415 Unsupported Media Type error.
      const headers = {
        ...(asset
          ? { Accept: 'application/octet-stream' }
          : { Accept: 'application/vnd.github+json' }),
      };
      await downloadFile(archiveUrl, downloadedAssetPath, { headers });
    } catch (error) {
      return {
        failureReason: 'failed to download asset',
        success: false,
        type: 'github-release',
        tagName: releaseData.tag_name,
        errorMessage: `Failed to download asset from ${archiveUrl}: ${getErrorMessage(error)}`,
      };
    }

    try {
      await extractFile(downloadedAssetPath, destination);
    } catch (error) {
      return {
        failureReason: 'failed to extract asset',
        success: false,
        type: 'github-release',
        tagName: releaseData.tag_name,
        errorMessage: `Failed to extract asset from ${downloadedAssetPath}: ${getErrorMessage(error)}`,
      };
    }

    // For regular github releases, the repository is put inside of a top level
    // directory. In this case we should see exactly two file in the destination
    // dir, the archive and the directory. If we see that, validate that the
    // dir has a gemini extension configuration file and then move all files
    // from the directory up one level into the destination directory.
    const entries = await fs.promises.readdir(destination, {
      withFileTypes: true,
    });
    if (entries.length === 2) {
      const lonelyDir = entries.find((entry) => entry.isDirectory());
      if (
        lonelyDir &&
        fs.existsSync(
          path.join(destination, lonelyDir.name, EXTENSIONS_CONFIG_FILENAME),
        )
      ) {
        const dirPathToExtract = path.join(destination, lonelyDir.name);
        const extractedDirFiles = await fs.promises.readdir(dirPathToExtract);
        for (const file of extractedDirFiles) {
          await fs.promises.rename(
            path.join(dirPathToExtract, file),
            path.join(destination, file),
          );
        }
        await fs.promises.rmdir(dirPathToExtract);
      }
    }

    await fs.promises.unlink(downloadedAssetPath);
    return {
      tagName: releaseData.tag_name,
      type: 'github-release',
      success: true,
    };
  } catch (error) {
    return {
      failureReason: 'unknown',
      success: false,
      type: 'github-release',
      tagName: releaseData?.tag_name,
      errorMessage: `Failed to download release from ${installMetadata.source}: ${getErrorMessage(error)}`,
    };
  }
}

interface GithubReleaseData {
  assets: Asset[];
  tag_name: string;
  tarball_url?: string;
  zipball_url?: string;
}

interface Asset {
  name: string;
  url: string;
}

export function findReleaseAsset(assets: Asset[]): Asset | undefined {
  const platform = os.platform();
  const arch = os.arch();

  const platformArchPrefix = `${platform}.${arch}.`;
  const platformPrefix = `${platform}.`;

  // Check for platform + architecture specific asset
  const platformArchAsset = assets.find((asset) =>
    asset.name.toLowerCase().startsWith(platformArchPrefix),
  );
  if (platformArchAsset) {
    return platformArchAsset;
  }

  // Check for platform specific asset
  const platformAsset = assets.find((asset) =>
    asset.name.toLowerCase().startsWith(platformPrefix),
  );
  if (platformAsset) {
    return platformAsset;
  }

  // Check for generic asset if only one is available
  const genericAsset = assets.find(
    (asset) =>
      !asset.name.toLowerCase().includes('darwin') &&
      !asset.name.toLowerCase().includes('linux') &&
      !asset.name.toLowerCase().includes('win32'),
  );
  if (assets.length === 1) {
    return genericAsset;
  }

  return undefined;
}

export interface DownloadOptions {
  headers?: Record<string, string>;
}

export async function downloadFile(
  url: string,
  dest: string,
  options?: DownloadOptions,
  redirectCount: number = 0,
): Promise<void> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new Error(`Invalid download URL ${url}: ${getErrorMessage(error)}`, {
      cause: error,
    });
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Refusing to download from insecure protocol ${parsedUrl.protocol} for URL ${url}. Only HTTPS is supported.`,
    );
  }

  const requestUrl = parsedUrl.toString();
  if (!(await validateUrlDestination(requestUrl))) {
    throw new Error(
      `Access to blocked or private host ${requestUrl} is not allowed.`,
    );
  }

  const headers: Record<string, string> = {
    'User-agent': 'gemini-cli',
    Accept: 'application/octet-stream',
    ...options?.headers,
  };
  const trustedGitHubUrl = isTrustedGitHubUrl(requestUrl);
  if (!trustedGitHubUrl) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'authorization') {
        delete headers[key];
      }
    }
  }
  const token = getGitHubToken();
  if (token && trustedGitHubUrl) {
    headers['Authorization'] = `token ${token}`;
  }

  let tempDest: string | undefined;
  let downloadPipeline: Promise<void> | undefined;

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let isRedirecting = false;
      let responseStream: IncomingMessage | undefined;

      const settleResolve = (): void => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const settleReject = (error: unknown): void => {
        if (!settled) {
          settled = true;
          reject(
            error instanceof Error ? error : new Error(getErrorMessage(error)),
          );
        }
      };

      const requestOptions = {
        headers,
        lookup: lookupPublicAddress,
        timeout: REQUEST_TIMEOUT_MS,
      };

      const req = https.get(requestUrl, requestOptions, (res) => {
        res.on('error', (error) => {
          if (!isRedirecting) {
            settleReject(error);
          }
        });

        if (res.statusCode && REDIRECT_STATUS_CODES.has(res.statusCode)) {
          if (redirectCount >= 10) {
            res.resume?.();
            settleReject(new Error('Too many redirects'));
            return;
          }

          if (!res.headers.location) {
            res.resume?.();
            settleReject(
              new Error('Redirect response missing Location header'),
            );
            return;
          }

          let redirectUrl: string;
          try {
            redirectUrl = new URL(res.headers.location, requestUrl).toString();
          } catch (error) {
            res.resume?.();
            settleReject(
              new Error(
                `Invalid redirect URL from ${requestUrl} (status ${res.statusCode}): ${getErrorMessage(error)}`,
                { cause: error },
              ),
            );
            return;
          }

          isRedirecting = true;
          res.resume?.();
          void downloadFile(redirectUrl, dest, options, redirectCount + 1).then(
            settleResolve,
            settleReject,
          );
          return;
        }

        if (res.statusCode !== 200) {
          res.resume?.();
          settleReject(
            new Error(`Request failed with status code ${res.statusCode}`),
          );
          return;
        }

        responseStream = res;
        const currentTempDest = `${dest}.${crypto.randomUUID()}.tmp`;
        tempDest = currentTempDest;

        let file: fs.WriteStream;
        try {
          file = fs.createWriteStream(currentTempDest);
        } catch (error) {
          res.destroy?.();
          settleReject(error);
          return;
        }

        // Settle synchronously in true emission order while also keeping an
        // error listener attached so secondary teardown errors never go unhandled.
        file.on('error', settleReject);

        downloadPipeline = pipeline(res, file);
        void downloadPipeline.then(() => {
          if (res.complete === false) {
            settleReject(
              new Error(
                `Response ended prematurely while downloading ${requestUrl}`,
              ),
            );
            return;
          }
          settleResolve();
        }, settleReject);
      });

      req.on('error', (error) => {
        if (isRedirecting) {
          return;
        }
        settleReject(error);
        responseStream?.destroy?.();
      });

      req.on('timeout', () => {
        if (!isRedirecting) {
          settleReject(
            new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`),
          );
          responseStream?.destroy?.();
        }
        // Always release the original socket. A redirect in flight runs on its
        // own request, so destroying this one does not affect it.
        req.destroy?.();
      });
    });

    if (tempDest) {
      await fs.promises.rename(tempDest, dest);
    }
  } catch (error) {
    if (downloadPipeline) {
      try {
        await downloadPipeline;
      } catch {
        // Already captured via settleReject; wait for file handle to close before unlinking.
      }
    }
    if (tempDest) {
      try {
        await fs.promises.unlink(tempDest);
      } catch {
        // Ignore cleanup errors if the temporary file was never created or already removed.
      }
    }
    throw error;
  }
}

export async function extractFile(file: string, dest: string): Promise<void> {
  if (file.endsWith('.tar.gz')) {
    await tar.x({
      file,
      cwd: dest,
    });
  } else if (file.endsWith('.zip')) {
    await extract(file, { dir: dest });
  } else {
    throw new Error(`Unsupported file extension for extraction: ${file}`);
  }
}
