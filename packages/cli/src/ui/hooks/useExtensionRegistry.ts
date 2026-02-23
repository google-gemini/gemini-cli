/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ExtensionRegistryClient,
  type RegistryExtension,
} from '../../config/extensionRegistryClient.js';

export interface UseExtensionRegistryResult {
  extensions: RegistryExtension[];
  loading: boolean;
  error: string | null;
  search: (query: string) => void;
}

export function useExtensionRegistry(
  initialQuery = '',
): UseExtensionRegistryResult {
  const [extensions, setExtensions] = useState<RegistryExtension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => new ExtensionRegistryClient(), []);

  // Ref to track the latest query to avoid race conditions
  const latestQueryRef = useRef(initialQuery);

  // Ref for debounce timeout
  const debounceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const searchExtensions = useCallback(
    async (query: string) => {
      try {
        setLoading(true);
        const results = await client.searchExtensions(query);

        // Only update if this is still the latest query
        if (query === latestQueryRef.current) {
          // Check if results are different from current extensions
          setExtensions((prev) => {
            if (
              prev.length === results.length &&
              prev.every((ext, i) => ext.id === results[i].id)
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
          setExtensions([]);
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
        void searchExtensions(query);
      }, 300);
    },
    [searchExtensions],
  );

  // Initial load
  useEffect(() => {
    void searchExtensions(initialQuery);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [initialQuery, searchExtensions]);

  return {
    extensions,
    loading,
    error,
    search,
  };
}
