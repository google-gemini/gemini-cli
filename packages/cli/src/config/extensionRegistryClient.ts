/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchWithTimeout } from '@google/gemini-cli-core';
import { AsyncFzf } from 'fzf';

export interface RegistryExtension {
  id: string;
  rank: number;
  url: string;
  fullName: string;
  repoDescription: string;
  stars: number;
  lastUpdated: string;
  extensionName: string;
  extensionVersion: string;
  extensionDescription: string;
  avatarUrl: string;
  hasMCP: boolean;
  hasContext: boolean;
  hasHooks: boolean;
  hasSkills: boolean;
  hasCustomCommands: boolean;
  isGoogleOwned: boolean;
  licenseKey: string;
}

export class ExtensionRegistryClient {
  private static readonly REGISTRY_URL =
    'https://geminicli.com/extensions.json';
  private static readonly FETCH_TIMEOUT_MS = 10000; // 10 seconds

  private static fetchPromise: Promise<RegistryExtension[]> | null = null;

  /** @internal */
  static resetCache() {
    ExtensionRegistryClient.fetchPromise = null;
  }

  async getExtensions(
    page: number = 1,
    limit: number = 10,
    orderBy: 'ranking' | 'alphabetical' = 'ranking',
  ): Promise<{ extensions: RegistryExtension[]; total: number }> {
    const allExtensions = [...(await this.fetchAllExtensions())];

    switch (orderBy) {
      case 'ranking':
        allExtensions.sort((a, b) => a.rank - b.rank);
        break;
      case 'alphabetical':
        allExtensions.sort((a, b) =>
          a.extensionName.localeCompare(b.extensionName),
        );
        break;
      default: {
        const _exhaustiveCheck: never = orderBy;
        throw new Error(`Unhandled orderBy: ${_exhaustiveCheck}`);
      }
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    return {
      extensions: allExtensions.slice(startIndex, endIndex),
      total: allExtensions.length,
    };
  }

  async searchExtensions(query: string): Promise<RegistryExtension[]> {
    const allExtensions = await this.fetchAllExtensions();
    if (!query.trim()) {
      return allExtensions;
    }

    const fzf = new AsyncFzf(allExtensions, {
      selector: (ext: RegistryExtension) =>
        `${ext.extensionName} ${ext.extensionDescription} ${ext.fullName}`,
      fuzzy: 'v2',
    });
    const results = await fzf.find(query);
    return results.map((r: { item: RegistryExtension }) => r.item);
  }

  async getExtension(id: string): Promise<RegistryExtension | undefined> {
    const allExtensions = await this.fetchAllExtensions();
    return allExtensions.find((ext) => ext.id === id);
  }

  private async fetchAllExtensions(): Promise<RegistryExtension[]> {
    if (ExtensionRegistryClient.fetchPromise) {
      return ExtensionRegistryClient.fetchPromise;
    }

    ExtensionRegistryClient.fetchPromise = (async () => {
      try {
        const response = await fetchWithTimeout(
          ExtensionRegistryClient.REGISTRY_URL,
          ExtensionRegistryClient.FETCH_TIMEOUT_MS,
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch extensions: ${response.statusText}`);
        }

        return (await response.json()) as RegistryExtension[];
      } catch (error) {
        // Clear the promise on failure so that subsequent calls can try again
        ExtensionRegistryClient.fetchPromise = null;
        throw error;
      }
    })();

    return ExtensionRegistryClient.fetchPromise;
  }
}
