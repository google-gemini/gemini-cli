/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { simpleGit } from 'simple-git';
import {
  debugLogger,
  getErrorMessage,
  type GeminiCLIExtension,
} from '@google/gemini-cli-core';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import type { ExtensionConfig } from '../extension.js';
import type { ExtensionManager } from '../extension-manager.js';

import {
  cloneFromGit,
  downloadFromGitHubRelease,
  tryParseGithubUrl,
  fetchReleaseFromGithub,
  findReleaseAsset,
  downloadFile,
  extractFile,
  fetchJson,
} from '@google/gemini-cli-core';

export {
  cloneFromGit,
  downloadFromGitHubRelease,
  tryParseGithubUrl,
  fetchReleaseFromGithub,
  findReleaseAsset,
  downloadFile,
  extractFile,
  fetchJson,
};

export interface GithubRepoInfo {
  owner: string;
  repo: string;
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
