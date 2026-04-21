/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  TeamRegistryClient,
  type RegistryTeam,
} from '@google/gemini-cli-core';

export interface UseTeamRegistryResult {
  teams: RegistryTeam[];
  loading: boolean;
  error: string | null;
  search: (query: string) => void;
}

export function useTeamRegistry(
  initialQuery = '',
  registryURI?: string,
): UseTeamRegistryResult {
  const [teams, setTeams] = useState<RegistryTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(
    () => new TeamRegistryClient(registryURI),
    [registryURI],
  );

  // Ref to track the latest query to avoid race conditions
  const latestQueryRef = useRef(initialQuery);

  // Ref for debounce timeout
  const debounceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const searchTeams = useCallback(
    async (query: string) => {
      try {
        setLoading(true);
        const results = await client.searchTeams(query);

        // Only update if this is still the latest query
        if (query === latestQueryRef.current) {
          // Check if results are different from current teams
          setTeams((prev) => {
            if (
              prev.length === results.length &&
              prev.every((team, i) => team.id === results[i].id)
            ) {
              return prev;
            }
            return results;
          });
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (query === latestQueryRef.current) {
          setError(err instanceof Error ? err.message : String(err));
          setTeams([]);
          setLoading(false);
        }
      }
    },
    [client],
  );

  const search = useCallback(
    (query: string) => {
      latestQueryRef.current = query;

      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Debounce
      debounceTimeoutRef.current = setTimeout(() => {
        void searchTeams(query);
      }, 300);
    },
    [searchTeams],
  );

  // Initial load
  useEffect(() => {
    void searchTeams(initialQuery);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [initialQuery, searchTeams]);

  return {
    teams,
    loading,
    error,
    search,
  };
}
