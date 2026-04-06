/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import * as fs from 'node:fs/promises';
import { TeamRegistryClient } from './teamRegistryClient.js';
import { type RegistryTeam } from './types.js';
import { fetchWithTimeout, isPrivateIp } from '../utils/fetch.js';
import { resolveToRealPath } from '../utils/paths.js';

vi.mock('../utils/fetch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/fetch.js')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
    isPrivateIp: vi.fn(),
  };
});

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

const mockTeams: RegistryTeam[] = [
  {
    id: 'team1',
    name: 'frontend-experts',
    displayName: 'Frontend Experts',
    description: 'A team of UI/UX and React specialists.',
    instructions: 'Focus on clean code and accessibility.',
    agents: [
      { name: 'ui-agent', provider: 'gemini', description: 'UI specialist' },
      { name: 'ux-agent', provider: 'gemini', description: 'UX specialist' },
    ],
    author: 'Google',
    stars: 150,
    lastUpdated: '2025-01-01T00:00:00Z',
    version: '1.0.0',
  },
  {
    id: 'team2',
    name: 'backend-pros',
    displayName: 'Backend Pros',
    description: 'Experts in Node.js, databases, and APIs.',
    instructions: 'Prioritize performance and security.',
    agents: [
      { name: 'api-agent', provider: 'gemini', description: 'API specialist' },
      { name: 'db-agent', provider: 'gemini', description: 'DB specialist' },
    ],
    author: 'Community',
    stars: 80,
    lastUpdated: '2025-01-02T00:00:00Z',
    version: '0.9.0',
  },
];

describe('TeamRegistryClient', () => {
  let client: TeamRegistryClient;
  let fetchMock: Mock;
  let isPrivateIpMock: Mock;

  beforeEach(() => {
    TeamRegistryClient.resetCache();
    client = new TeamRegistryClient();
    fetchMock = fetchWithTimeout as Mock;
    isPrivateIpMock = isPrivateIp as Mock;
    fetchMock.mockReset();
    isPrivateIpMock.mockReset();
    isPrivateIpMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch and return all teams from remote registry', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockTeams,
    });

    const result = await client.fetchAllTeams();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('team1');
    expect(result[1].id).toBe('team2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://geminicli.com/teams.json',
      10000,
    );
  });

  it('should search teams by name or description', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockTeams,
    });

    const results = await client.searchTeams('frontend');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('team1');
  });

  it('should search teams by agent name', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockTeams,
    });

    const results = await client.searchTeams('api-agent');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('team2');
  });

  it('should get a team by ID', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockTeams,
    });

    const result = await client.getTeam('team2');
    expect(result).toBeDefined();
    expect(result?.id).toBe('team2');
  });

  it('should return undefined if team not found', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockTeams,
    });

    const result = await client.getTeam('non-existent');
    expect(result).toBeUndefined();
  });

  it('should cache the fetch result', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockTeams,
    });

    await client.fetchAllTeams();
    await client.fetchAllTeams();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should throw an error if fetch fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
    });

    await expect(client.fetchAllTeams()).rejects.toThrow(
      'Failed to fetch teams: Internal Server Error',
    );
  });

  it('should block private IP addresses for remote registry', async () => {
    isPrivateIpMock.mockReturnValue(true);

    await expect(client.fetchAllTeams()).rejects.toThrow(
      'Private IP addresses are not allowed for the team registry.',
    );
  });

  it('should fetch teams from a local file path', async () => {
    const filePath = '/path/to/teams.json';
    const clientWithFile = new TeamRegistryClient(filePath);
    const mockReadFile = vi.mocked(fs.readFile);
    mockReadFile.mockResolvedValue(JSON.stringify(mockTeams));

    const result = await clientWithFile.fetchAllTeams();
    expect(result).toHaveLength(2);
    expect(mockReadFile).toHaveBeenCalledWith(
      resolveToRealPath(filePath),
      'utf-8',
    );
  });
});
