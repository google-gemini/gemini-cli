/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useStdout } from 'ink';
import { useEffect, useRef } from 'react';

export const VIM_CURSOR_SHAPE_DEFAULT = '\x1b[0 q';
export const VIM_CURSOR_SHAPE_NORMAL = '\x1b[2 q';
export const VIM_CURSOR_SHAPE_INSERT = '\x1b[6 q';

interface UseVimCursorShapeOptions {
  enabled: boolean;
  vimEnabled: boolean;
  vimMode: 'NORMAL' | 'INSERT';
}

interface DesiredCursorShapeOptions extends UseVimCursorShapeOptions {
  lastApplied: string | null;
}

function isInteractiveTerminal(
  stdout: ReturnType<typeof useStdout>['stdout'],
): boolean {
  return Boolean(stdout && ('isTTY' in stdout ? stdout.isTTY !== false : true));
}

export function getDesiredVimCursorShape({
  enabled,
  vimEnabled,
  vimMode,
  lastApplied,
}: DesiredCursorShapeOptions): string | null {
  if (enabled && vimEnabled) {
    return vimMode === 'NORMAL'
      ? VIM_CURSOR_SHAPE_NORMAL
      : VIM_CURSOR_SHAPE_INSERT;
  }

  return lastApplied ? VIM_CURSOR_SHAPE_DEFAULT : null;
}

export function useVimCursorShape({
  enabled,
  vimEnabled,
  vimMode,
}: UseVimCursorShapeOptions): void {
  const { stdout } = useStdout();
  const lastAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isInteractiveTerminal(stdout)) {
      return;
    }

    const desiredCursorShape = getDesiredVimCursorShape({
      enabled,
      vimEnabled,
      vimMode,
      lastApplied: lastAppliedRef.current,
    });

    if (!desiredCursorShape || lastAppliedRef.current === desiredCursorShape) {
      return;
    }

    stdout.write(desiredCursorShape);
    lastAppliedRef.current = desiredCursorShape;
  }, [enabled, stdout, vimEnabled, vimMode]);

  useEffect(
    () => () => {
      if (
        !isInteractiveTerminal(stdout) ||
        !lastAppliedRef.current ||
        lastAppliedRef.current === VIM_CURSOR_SHAPE_DEFAULT
      ) {
        return;
      }

      stdout.write(VIM_CURSOR_SHAPE_DEFAULT);
      lastAppliedRef.current = VIM_CURSOR_SHAPE_DEFAULT;
    },
    [stdout],
  );
}
