/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { simpleGit } from 'simple-git';
import { getErrorMessage } from '../../utils/errors.js';
import type {
  ExtensionInstallMetadata,
  GeminiCLIExtension,
} from '@google/gemini-cli-core';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import * as os from 'node:os';
import * as https from 'node:https';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXTENSIONS_CONFIG_FILENAME, loadExtension } from '../extension.js';

function getGitHubToken(): string | undefined {
  return process.env['GITHUB_TOKEN'];
}

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

export function parseGitHubRepoForReleases(source: string): {
  owner: string;
  repo: string;
} {
  // Default to a github repo path, so `source` can be just an org/repo
  const parsedUrl = URL.parse(source, 'https://github.com');
  // The pathname should be "/owner/repo".
  const parts = parsedUrl?.pathname
    .substring(1)
    .split('/')
    // Remove the empty segments, fixes trailing slashes
    .filter((part) => part !== '');
  if (parts?.length !== 2 || parsedUrl?.host !== 'github.com') {
    throw new Error(
      `Invalid GitHub repository source: ${source}. Expected "owner/repo" or a github repo uri.`,
    );
  }
  const owner = parts[0];
  const repo = parts[1].replace('.git', '');

  if (owner.startsWith('git@github.com')) {
    throw new Error(
      `GitHub release-based extensions are not supported for SSH. You must use an HTTPS URI with a personal access token to download releases from private repositories. You can set your personal access token in the GITHUB_TOKEN environment variable and install the extension via SSH.`,
    );
  }

  return { owner, repo };
}

async function fetchReleaseFromGithub(
  owner: string,
  repo: string,
  ref?: string,
): Promise<GithubReleaseData> {
  const endpoint = ref ? `releases/tags/${ref}` : 'releases/latest';
  const url = `https://api.github.com/repos/${owner}/${repo}/${endpoint}`;
  return await fetchJson(url);
}

export async function checkForExtensionUpdate(
  extension: GeminiCLIExtension,
  setExtensionUpdateState: (updateState: ExtensionUpdateState) => void,
  cwd: string = process.cwd(),
): Promise<void> {
  setExtensionUpdateState(ExtensionUpdateState.CHECKING_FOR_UPDATES);
  const installMetadata = extension.installMetadata;
  if (installMetadata?.type === 'local') {
    const newExtension = loadExtension({
      extensionDir: installMetadata.source,
      workspaceDir: cwd,
    });
    if (!newExtension) {
      console.error(
        `Failed to check for update for local extension "${extension.name}". Could not load extension from source path: ${installMetadata.source}`,
      );
      setExtensionUpdateState(ExtensionUpdateState.ERROR);
      return;
    }
    if (newExtension.config.version !== extension.version) {
      setExtensionUpdateState(ExtensionUpdateState.UPDATE_AVAILABLE);
      return;
    }
    setExtensionUpdateState(ExtensionUpdateState.UP_TO_DATE);
    return;
  }
  if (
    !installMetadata ||
    (installMetadata.type !== 'git' &&
      installMetadata.type !== 'github-release')
  ) {
    setExtensionUpdateState(ExtensionUpdateState.NOT_UPDATABLE);
    return;
  }
  try {
    if (installMetadata.type === 'git') {
      const git = simpleGit(extension.path);
      const remotes = await git.getRemotes(true);
      if (remotes.length === 0) {
        console.error('No git remotes found.');
        setExtensionUpdateState(ExtensionUpdateState.ERROR);
        return;
      }
      const remoteUrl = remotes[0].refs.fetch;
      if (!remoteUrl) {
        console.error(`No fetch URL found for git remote ${remotes[0].name}.`);
        setExtensionUpdateState(ExtensionUpdateState.ERROR);
        return;
      }

      // Determine the ref to check on the remote.
      const refToCheck = installMetadata.ref || 'HEAD';

      const lsRemoteOutput = await git.listRemote([remoteUrl, refToCheck]);

      if (typeof lsRemoteOutput !== 'string' || lsRemoteOutput.trim() === '') {
        console.error(`Git ref ${refToCheck} not found.`);
        setExtensionUpdateState(ExtensionUpdateState.ERROR);
        return;
      }

      const remoteHash = lsRemoteOutput.split('\t')[0];
      const localHash = await git.revparse(['HEAD']);

      if (!remoteHash) {
        console.error(
          `Unable to parse hash from git ls-remote output "${lsRemoteOutput}"`,
        );
        setExtensionUpdateState(ExtensionUpdateState.ERROR);
        return;
      }
      if (remoteHash === localHash) {
        setExtensionUpdateState(ExtensionUpdateState.UP_TO_DATE);
        return;
      }
      setExtensionUpdateState(ExtensionUpdateState.UPDATE_AVAILABLE);
      return;
    } else {
      const { source, releaseTag } = installMetadata;
      if (!source) {
        console.error(`No "source" provided for extension.`);
        setExtensionUpdateState(ExtensionUpdateState.ERROR);
        return;
      }
      const { owner, repo } = parseGitHubRepoForReleases(source);

      const releaseData = await fetchReleaseFromGithub(
        owner,
        repo,
        installMetadata.ref,
      );
      if (releaseData.tag_name !== releaseTag) {
        setExtensionUpdateState(ExtensionUpdateState.UPDATE_AVAILABLE);
        return;
      }
      setExtensionUpdateState(ExtensionUpdateState.UP_TO_DATE);
      return;
    }
  } catch (error) {
    console.error(
      `Failed to check for updates for extension "${installMetadata.source}": ${getErrorMessage(error)}`,
    );
    setExtensionUpdateState(ExtensionUpdateState.ERROR);
    return;
  }
}
export interface GitHubDownloadResult {
  tagName: string;
  type: 'git' | 'github-release';
}
export async function downloadFromGitHubRelease(
  installMetadata: ExtensionInstallMetadata,
  destination: string,
): Promise<GitHubDownloadResult> {
  const { source, ref } = installMetadata;
  const { owner, repo } = parseGitHubRepoForReleases(source);

  try {
    const releaseData = await fetchReleaseFromGithub(owner, repo, ref);
    if (!releaseData) {
      throw new Error(
        `No release data found for ${owner}/${repo} at tag ${ref}`,
      );
    }

    const asset = findReleaseAsset(releaseData.assets);
    let archiveUrl: string | undefined;
    let isTar = false;
    let isZip = false;
    if (asset) {
      archiveUrl = asset.browser_download_url;
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
      throw new Error(
        `No assets found for release with tag ${releaseData.tag_name}`,
      );
    }
    let downloadedAssetPath = path.join(
      destination,
      path.basename(new URL(archiveUrl).pathname),
    );
    if (isTar && !downloadedAssetPath.endsWith('.tar.gz')) {
      downloadedAssetPath += '.tar.gz';
    } else if (isZip && !downloadedAssetPath.endsWith('.zip')) {
      downloadedAssetPath += '.zip';
    }

    await downloadFile(archiveUrl, downloadedAssetPath);

    extractFile(downloadedAssetPath, destination);

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
    };
  } catch (error) {
    throw new Error(
      `Failed to download release from ${installMetadata.source}: ${getErrorMessage(error)}`,
    );
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
  browser_download_url: string;
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

async function fetchJson<T>(url: string): Promise<T> {
  const headers: { 'User-Agent': string; Authorization?: string } = {
    'User-Agent': 'gemini-cli',
  };
  const token = getGitHubToken();
  if (token) {
    headers.Authorization = `token ${token}`;
  }
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        if (res.statusCode !== 200) {
          return reject(
            new Error(`Request failed with status code ${res.statusCode}`),
          );
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString();
          resolve(JSON.parse(data) as T);
        });
      })
      .on('error', reject);
  });
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const headers: { 'User-agent': string; Authorization?: string } = {
    'User-agent': 'gemini-cli',
  };
  const token = getGitHubToken();
  if (token) {
    headers.Authorization = `token ${token}`;
  }
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
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

function extractFile(file: string, dest: string) {
  let args: string[];
  let command: 'tar' | 'unzip';
  if (file.endsWith('.tar.gz')) {
    args = ['-xzf', file, '-C', dest];
    command = 'tar';
  } else if (file.endsWith('.zip')) {
    args = [file, '-d', dest];
    command = 'unzip';
  } else {
    throw new Error(`Unsupported file extension for extraction: ${file}`);
  }

  const result = spawnSync(command, args, { stdio: 'pipe' });

  if (result.status !== 0) {
    if (result.error) {
      throw new Error(`Failed to spawn '${command}': ${result.error.message}`);
    }
    throw new Error(
      `'${command}' command failed with exit code ${result.status}: ${result.stderr.toString()}`,
    );
  }
}
