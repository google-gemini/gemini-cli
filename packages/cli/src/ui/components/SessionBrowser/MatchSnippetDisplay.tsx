/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { Colors } from '../../colors.js';
import type { SessionInfo } from '../../../utils/sessionUtils.js';

/**
 * Match snippet display component for search results.
 */
export const MatchSnippetDisplay = ({
  session,
  textColor,
}: {
  session: SessionInfo;
  textColor: (color?: string) => string;
}): React.JSX.Element | null => {
  if (!session.matchSnippets || session.matchSnippets.length === 0) {
    return null;
  }

  const firstMatch = session.matchSnippets[0];
  const rolePrefix = firstMatch.role === 'user' ? 'You:   ' : 'Gemini:';
  const roleColor = textColor(
    firstMatch.role === 'user' ? Colors.AccentGreen : Colors.AccentBlue,
  );

  return (
    <Text>
      <Text color={roleColor} bold>
        {rolePrefix}{' '}
      </Text>
      {firstMatch.before}
      <Text color={textColor(Colors.AccentRed)} bold>
        {firstMatch.match}
      </Text>
      {firstMatch.after}
    </Text>
  );
};
