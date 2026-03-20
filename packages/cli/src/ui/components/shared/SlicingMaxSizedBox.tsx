/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { MaxSizedBox, type MaxSizedBoxProps } from './MaxSizedBox.js';

// Large threshold to ensure we don't cause performance issues for very large
// outputs that will get truncated further MaxSizedBox anyway.
const MAXIMUM_RESULT_DISPLAY_CHARACTERS = 20000;

export interface SlicingMaxSizedBoxProps<T>
  extends Omit<MaxSizedBoxProps, 'children'> {
  data: T;
  maxLines?: number;
  isAlternateBuffer?: boolean;
  children: (truncatedData: T) => React.ReactNode;
}

/**
 * An extension of MaxSizedBox that performs explicit slicing of the input data
 * (string or array) before rendering. This is useful for performance and to
 * ensure consistent truncation behavior for large outputs.
 */
export function SlicingMaxSizedBox<T>({
  data,
  maxLines,
  isAlternateBuffer,
  children,
  ...boxProps
}: SlicingMaxSizedBoxProps<T>) {
  const { truncatedData, hiddenLinesCount } = useMemo(() => {
    let hiddenLines = 0;
    const overflowDirection = boxProps.overflowDirection ?? 'top';

    // Only truncate string output if not in alternate buffer mode to ensure
    // we can scroll through the full output.
    if (typeof data === 'string' && !isAlternateBuffer) {
      let text: string = data as string;
      if (text.length > MAXIMUM_RESULT_DISPLAY_CHARACTERS) {
        if (overflowDirection === 'bottom') {
          text = text.slice(0, MAXIMUM_RESULT_DISPLAY_CHARACTERS) + '...';
        } else {
          text = '...' + text.slice(-MAXIMUM_RESULT_DISPLAY_CHARACTERS);
        }
      }
      if (maxLines) {
        const hasTrailingNewline = text.endsWith('\n');
        const contentText = hasTrailingNewline ? text.slice(0, -1) : text;
        const lines = contentText.split('\n');
        if (lines.length > maxLines) {
          // We will have a label from MaxSizedBox. Reserve space for it.
          const targetLines = Math.max(1, maxLines - 1);
          hiddenLines = lines.length - targetLines;
          if (overflowDirection === 'bottom') {
            text =
              lines.slice(0, targetLines).join('\n') +
              (hasTrailingNewline ? '\n' : '');
          } else {
            text =
              lines.slice(-targetLines).join('\n') +
              (hasTrailingNewline ? '\n' : '');
          }
        }
      }
      return {
        truncatedData: text,
        hiddenLinesCount: hiddenLines,
      };
    }

    if (Array.isArray(data) && !isAlternateBuffer && maxLines) {
      if (data.length > maxLines) {
        // We will have a label from MaxSizedBox. Reserve space for it.
        const targetLines = Math.max(1, maxLines - 1);
        const hiddenCount = data.length - targetLines;
        return {
          truncatedData:
            overflowDirection === 'bottom'
              ? data.slice(0, targetLines)
              : data.slice(-targetLines),
          hiddenLinesCount: hiddenCount,
        };
      }
    }

    return { truncatedData: data, hiddenLinesCount: 0 };
  }, [data, isAlternateBuffer, maxLines, boxProps.overflowDirection]);

  return (
    <MaxSizedBox
      {...boxProps}
      additionalHiddenLinesCount={
        (boxProps.additionalHiddenLinesCount ?? 0) + hiddenLinesCount
      }
    >
      {/* eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion */}
      {children(truncatedData as unknown as T)}
    </MaxSizedBox>
  );
}
