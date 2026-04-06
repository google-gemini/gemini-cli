/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { simpleGit } from 'simple-git';
import * as os from 'node:os';
import * as https from 'node:https';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as tar from 'tar';
import extract from 'extract-zip';
import { getErrorMessage } from './errors.js';
import { fetchJson, getGitHubToken } from './github_fetch.js';
import { type ExtensionInstallMetadata } from '../config/config.js';

/**
 * Clones a Git repository to a specified local path.
 * @param installMetadata The metadata for the item to install.
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
      `Failed to clone Git repository from ${installMetadata.source}: ${getErrorMessage(error)}`,
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
    throw new TypeError(`Invalid repo URL: ${source}`, { cause: e });
  }

  if (!parsedUrl || parsedUrl.host !== 'github.com') {
    return null;
  }
  // The pathname should be "/owner/repo".
  const parts = parsedUrl.pathname
    .split('/')
    // Remove the empty segments, fixes trailing and leading slashes
    .filter((part) => part !== '');

  if (parts.length < 2) {
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

export interface GithubReleaseData {
  assets: Asset[];
  tag_name: string;
  tarball_url?: string;
  zipball_url?: string;
}

export interface Asset {
  name: string;
  url: string;
}

export async function fetchReleaseFromGithub(
  owner: string,
  repo: string,
  ref?: string,
  allowPreRelease?: boolean,
): Promise<GithubReleaseData | null> {
  if (ref) {
    return fetchJson<GithubReleaseData>(
      `https://api.github.com/repos/${owner}/${repo}/releases/tags/${ref}`,
    );
  }

  if (!allowPreRelease) {
    try {
      return await fetchJson<GithubReleaseData>(
        `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
      );
    } catch (_) {
      // Fallback to pre-release logic
    }
  }

  const releases = await fetchJson<GithubReleaseData[]>(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=1`,
  );
  if (releases.length === 0) {
    return null;
  }
  return releases[0];
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

/**
 * Downloads a release from GitHub and extracts it to the destination.
 */
export async function downloadFromGitHubRelease(
  installMetadata: ExtensionInstallMetadata,
  destination: string,
  githubRepoInfo: GithubRepoInfo,
  configFileName?: string, // e.g. EXTENSIONS_CONFIG_FILENAME
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

    // Post-extraction cleanup: move nested repository files to top level
    if (configFileName) {
      const entries = await fs.promises.readdir(destination, { withFileTypes: true });
      if (entries.length === 2) {
        const lonelyDir = entries.find((entry) => entry.isDirectory());
        if (lonelyDir && fs.existsSync(path.join(destination, lonelyDir.name, configFileName))) {
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
