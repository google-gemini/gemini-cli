/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { getBoundingBox, type DOMElement } from 'ink';
import { useMouse, type MouseEvent } from '../hooks/useMouse.js';

export interface ScrollState {
  scrollTop: number;
  scrollHeight: number;
  innerHeight: number;
}

export interface ScrollableEntry {
  id: string;
  ref: React.RefObject<DOMElement>;
  getScrollState: () => ScrollState;
  scrollBy: (delta: number) => void;
  hasFocus: () => boolean;
  flashScrollbar: () => void;
}

interface ScrollContextType {
  register: (entry: ScrollableEntry) => void;
  unregister: (id: string) => void;
}

const ScrollContext = createContext<ScrollContextType | null>(null);

const findScrollableCandidates = (
  mouseEvent: MouseEvent,
  scrollables: Map<string, ScrollableEntry>,
) => {
  const candidates: Array<ScrollableEntry & { area: number }> = [];

  for (const entry of scrollables.values()) {
    if (!entry.ref.current || !entry.hasFocus()) {
      continue;
    }

    const boundingBox = getBoundingBox(entry.ref.current);
    if (!boundingBox) continue;

    const { x, y, width, height } = boundingBox;

    const isInside =
      mouseEvent.col >= x &&
      mouseEvent.col < x + width + 1 && // Intentionally add one to width to include scrollbar.
      mouseEvent.row >= y &&
      mouseEvent.row < y + height;

    if (isInside) {
      candidates.push({ ...entry, area: width * height });
    }
  }

  // Sort by smallest area first
  candidates.sort((a, b) => a.area - b.area);
  return candidates;
};

export const ScrollProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [scrollables, setScrollables] = useState(
    new Map<string, ScrollableEntry>(),
  );

  const register = useCallback((entry: ScrollableEntry) => {
    setScrollables((prev) => new Map(prev).set(entry.id, entry));
  }, []);

  const unregister = useCallback((id: string) => {
    setScrollables((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const scrollablesRef = useRef(scrollables);
  useEffect(() => {
    scrollablesRef.current = scrollables;
  }, [scrollables]);

  const handleScroll = (direction: 'up' | 'down', mouseEvent: MouseEvent) => {
    const delta = direction === 'up' ? -1 : 1;
    const candidates = findScrollableCandidates(
      mouseEvent,
      scrollablesRef.current,
    );

    for (const candidate of candidates) {
      const { scrollTop, scrollHeight, innerHeight } =
        candidate.getScrollState();

      // Epsilon to handle floating point inaccuracies.
      const canScrollUp = scrollTop > 0.001;
      const canScrollDown = scrollTop < scrollHeight - innerHeight - 0.001;

      if (direction === 'up' && canScrollUp) {
        candidate.scrollBy(delta);
        return;
      }

      if (direction === 'down' && canScrollDown) {
        candidate.scrollBy(delta);
        return;
      }
    }
  };

  const handleClick = (mouseEvent: MouseEvent) => {
    const candidates = findScrollableCandidates(
      mouseEvent,
      scrollablesRef.current,
    );

    if (candidates.length > 0) {
      // The first candidate is the innermost one.
      candidates[0].flashScrollbar();
    }
  };

  useMouse(
    (event: MouseEvent) => {
      if (event.name === 'scroll-up') {
        handleScroll('up', event);
      } else if (event.name === 'scroll-down') {
        handleScroll('down', event);
      } else if (event.name === 'left-press') {
        handleClick(event);
      }
    },
    { isActive: true },
  );

  return (
    <ScrollContext.Provider value={{ register, unregister }}>
      {children}
    </ScrollContext.Provider>
  );
};

let nextId = 0;

export const useScrollable = (
  entry: Omit<ScrollableEntry, 'id'>,
  isActive: boolean,
) => {
  const context = useContext(ScrollContext);
  if (!context) {
    throw new Error('useScrollable must be used within a ScrollProvider');
  }

  const [id] = useState(() => `scrollable-${nextId++}`);

  useEffect(() => {
    if (isActive) {
      context.register({ ...entry, id });
      return () => {
        context.unregister(id);
      };
    }
    return;
  }, [context, entry, id, isActive]);
};
