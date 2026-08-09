/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useTextBuffer,
  type TextBuffer,
} from '../components/shared/text-buffer.js';
import { useUIState } from '../contexts/UIStateContext.js';

const MIN_VIEWPORT_WIDTH = 20;
const VIEWPORT_WIDTH_OFFSET = 8;

export interface UseSearchBufferProps {
  initialText?: string;
  onChange: (text: string) => void;
}

export function useSearchBuffer({
  initialText = '',
  onChange,
}: UseSearchBufferProps): TextBuffer {
  const { mainAreaWidth } = useUIState();
  const viewportWidth = Math.max(
    MIN_VIEWPORT_WIDTH,
    mainAreaWidth - VIEWPORT_WIDTH_OFFSET,
  );

  return useTextBuffer({
    initialText,
    initialCursorOffset: initialText.length,
    viewport: {
      width: viewportWidth,
      height: 1,
    },
    singleLine: true,
    onChange,
  });
}
