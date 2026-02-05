/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
  private cache: RegistryExtension[] | null = null;

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
      default:
        break;
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
    const lowerQuery = query.toLowerCase();
    return allExtensions.filter(
      (ext) =>
        ext.extensionName.toLowerCase().includes(lowerQuery) ||
        ext.extensionDescription.toLowerCase().includes(lowerQuery) ||
        ext.fullName.toLowerCase().includes(lowerQuery),
    );
  }

  async getExtension(id: string): Promise<RegistryExtension | undefined> {
    const allExtensions = await this.fetchAllExtensions();
    return allExtensions.find((ext) => ext.id === id);
  }

  private async fetchAllExtensions(): Promise<RegistryExtension[]> {
    if (this.cache) {
      return this.cache;
    }

    const response = await fetch(ExtensionRegistryClient.REGISTRY_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch extensions: ${response.statusText}`);
    }

    this.cache = (await response.json()) as RegistryExtension[];
    return this.cache;
  }
}
