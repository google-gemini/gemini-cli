/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { simpleGit } from 'simple-git';
import { getErrorMessage } from '../../utils/errors.js';
import {
  debugLogger,
  type ExtensionInstallMetadata,
  type GeminiCLIExtension,
} from '@google/gemini-cli-core';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import * as os from 'node:os';
import * as https from 'node:https';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as tar from 'tar';
import extract from 'extract-zip';
import { fetchJson, getGitHubToken } from './github_fetch.js';
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
    const git = simpleGit(destination);
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
  const repo = parts[1].replace('.git', '');

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
    } catch (_) {
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
  try {
    if (installMetadata.type === 'git') {
      const git = simpleGit(extension.path);
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
  const headers: Record<string, string> = {
    'User-agent': 'gemini-cli',
    Accept: 'application/octet-stream',
    ...options?.headers,
  };
  const token = getGitHubToken();
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          if (redirectCount >= 10) {
            return reject(new Error('Too many redirects'));
          }

          if (!res.headers.location) {
            return reject(
              new Error('Redirect response missing Location header'),
            );
          }
          downloadFile(res.headers.location, dest, options, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          return reject(
            new Error(`Request failed with status code ${res.statusCode}`),
          );
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve as () => void));
      })
      .on('error', reject);
  });
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
