/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import { AsyncFzf } from 'fzf';
import { fetchWithTimeout, isPrivateIp } from '../utils/fetch.js';
import { resolveToRealPath } from '../utils/paths.js';
import { type RegistryTeam } from './types.js';

/**
 * Client for fetching and searching agent teams from a remote or local registry.
 */
export class TeamRegistryClient {
  static readonly DEFAULT_REGISTRY_URL = 'https://geminicli.com/teams.json';
  private static readonly FETCH_TIMEOUT_MS = 10000; // 10 seconds

  private static fetchPromise: Promise<RegistryTeam[]> | null = null;
  private readonly registryURI: string;

  constructor(registryURI?: string) {
    this.registryURI = registryURI || TeamRegistryClient.DEFAULT_REGISTRY_URL;
  }

  /**
   * Resets the internal fetch cache.
   * @internal
   */
  static resetCache() {
    TeamRegistryClient.fetchPromise = null;
  }

  /**
   * Fetches all teams from the configured registry URI.
   * Supports both remote (https://) and local file paths.
   */
  async fetchAllTeams(): Promise<RegistryTeam[]> {
    if (TeamRegistryClient.fetchPromise) {
      return TeamRegistryClient.fetchPromise;
    }

    const uri = this.registryURI;
    TeamRegistryClient.fetchPromise = (async () => {
      try {
        if (uri.startsWith('http')) {
          if (isPrivateIp(uri)) {
            throw new Error(
              'Private IP addresses are not allowed for the team registry.',
            );
          }
          const response = await fetchWithTimeout(
            uri,
            TeamRegistryClient.FETCH_TIMEOUT_MS,
          );
          if (!response.ok) {
            throw new Error(`Failed to fetch teams: ${response.statusText}`);
          }

          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          return (await response.json()) as RegistryTeam[];
        } else {
          // Handle local file path
          const filePath = resolveToRealPath(uri);
          const content = await fs.readFile(filePath, 'utf-8');
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          return JSON.parse(content) as RegistryTeam[];
        }
      } catch (error) {
        TeamRegistryClient.fetchPromise = null;
        if (error instanceof Error) {
          throw error;
        }
        throw new Error(String(error));
      }
    })();

    return TeamRegistryClient.fetchPromise;
  }

  /**
   * Searches for teams matching the given query using fuzzy matching.
   * @param query The search query string.
   */
  async searchTeams(query: string): Promise<RegistryTeam[]> {
    const allTeams = await this.fetchAllTeams();
    if (!query.trim()) {
      return allTeams;
    }

    const fzf = new AsyncFzf(allTeams, {
      selector: (team: RegistryTeam) =>
        `${team.name} ${team.displayName} ${team.description} ${team.agents.map((a) => a.name).join(' ')}`,
      fuzzy: true,
    });

    const results = await fzf.find(query);
    return results.map((r: { item: RegistryTeam }) => r.item);
  }

  /**
   * Fetches a single team by its ID.
   * @param id The unique identifier of the team.
   */
  async getTeam(id: string): Promise<RegistryTeam | undefined> {
    const allTeams = await this.fetchAllTeams();
    return allTeams.find((team) => team.id === id);
  }
}
