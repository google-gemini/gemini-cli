/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { useAtCompletion } from './useAtCompletion.js';
import type { Config, AgentDefinition } from '@google/gemini-cli-core';
import { createTmpDir, cleanupTmpDir } from '@google/gemini-cli-test-utils';
import type { Suggestion } from '../components/SuggestionsDisplay.js';
import { CommandKind } from '../commands/types.js';

// Test harness to capture the state from the hook's callbacks.
function useTestHarnessForAtCompletion(
  enabled: boolean,
  pattern: string,
  config: Config | undefined,
  cwd: string,
) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  useAtCompletion({
    enabled,
    pattern,
    config,
    cwd,
    setSuggestions,
    setIsLoadingSuggestions,
  });

  return { suggestions, isLoadingSuggestions };
}

describe('useAtCompletion with Agents', () => {
  let testRootDir: string;
  let mockConfig: Config;

  beforeEach(() => {
    const mockAgentRegistry = {
      getAllDefinitions: vi.fn(() => [
        {
          name: 'CodebaseInvestigator',
          description: 'Investigates codebase',
          kind: 'local',
        } as AgentDefinition,
        {
          name: 'OtherAgent',
          description: 'Another agent',
          kind: 'local',
        } as AgentDefinition,
      ]),
    };

    mockConfig = {
      getFileFilteringOptions: vi.fn(() => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      })),
      getEnableRecursiveFileSearch: () => true,
      getFileFilteringDisableFuzzySearch: () => false,
      getResourceRegistry: vi.fn().mockReturnValue({
        getAllResources: () => [],
      }),
      getAgentRegistry: () => mockAgentRegistry,
    } as unknown as Config;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (testRootDir) {
      await cleanupTmpDir(testRootDir);
    }
    vi.restoreAllMocks();
  });

  it('should include agent suggestions', async () => {
    testRootDir = await createTmpDir({});

    const { result } = renderHook(() =>
      useTestHarnessForAtCompletion(true, '', mockConfig, testRootDir),
    );

    await waitFor(() => {
      expect(result.current.suggestions.length).toBeGreaterThan(0);
    });

    const agentSuggestion = result.current.suggestions.find(
      (s) => s.value === 'CodebaseInvestigator',
    );
    expect(agentSuggestion).toBeDefined();
    expect(agentSuggestion?.commandKind).toBe(CommandKind.AGENT);
  });

  it('should filter agent suggestions', async () => {
    testRootDir = await createTmpDir({});

    const { result } = renderHook(() =>
      useTestHarnessForAtCompletion(true, 'Code', mockConfig, testRootDir),
    );

    await waitFor(() => {
      expect(result.current.suggestions.length).toBeGreaterThan(0);
    });

    expect(result.current.suggestions.map((s) => s.value)).toContain(
      'CodebaseInvestigator',
    );
    expect(result.current.suggestions.map((s) => s.value)).not.toContain(
      'OtherAgent',
    );
  });
});
