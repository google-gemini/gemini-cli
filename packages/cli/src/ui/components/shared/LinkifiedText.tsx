/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, type TextProps } from 'ink';
import Link from 'ink-link';
import { URL_REGEX, isUrl } from '../../utils/urlUtils.js';
import { theme } from '../../semantic-colors.js';

interface LinkifiedTextProps extends TextProps {
  children: string;
}

export const LinkifiedText: React.FC<LinkifiedTextProps> = ({
  children,
  ...textProps
}) => {
  if (!children) {
    return <Text {...textProps}>{children}</Text>;
  }

  // Split by regex but keep delimiters (the URLs)
  // split() with capturing group in regex returns the separators too
  const parts = children.split(URL_REGEX);

  return (
    <Text {...textProps}>
      {parts.map((part, index) => {
        const key = `linkified-${index}`;

        if (isUrl(part)) {
          return (
            <Link key={key} url={part} fallback={false}>
              <Text {...textProps} color={theme.text.link} underline>
                {part}
              </Text>
            </Link>
          );
        }

        return <React.Fragment key={key}>{part}</React.Fragment>;
      })}
    </Text>
  );
};
