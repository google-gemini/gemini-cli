/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useEffect, useCallback } from 'react';

/**
 * A hook to manage batched scroll state updates.
 * It allows multiple scroll operations within the same tick to accumulate
 * by keeping track of a 'pending' state that resets after render.
 */
export function useBatchedScroll(currentScrollTop: number) {
  const pendingScrollTopRef = useRef<number | null>(null);
  // We use a ref for currentScrollTop to allow getScrollTop to be stable
  // and not depend on the currentScrollTop value directly in its dependency array.
  const currentScrollTopRef = useRef(currentScrollTop);

  useEffect(() => {
    currentScrollTopRef.current = currentScrollTop;
    pendingScrollTopRef.current = null;
  });

  const getScrollTop = useCallback(
    () => pendingScrollTopRef.current ?? currentScrollTopRef.current,
    [],
  );

  const setPendingScrollTop = useCallback((newScrollTop: number) => {
    pendingScrollTopRef.current = newScrollTop;
  }, []);

  return { getScrollTop, setPendingScrollTop };
}
