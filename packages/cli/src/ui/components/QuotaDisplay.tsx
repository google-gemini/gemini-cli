/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import {
  getUsedStatusColor,
  QUOTA_USED_WARNING_THRESHOLD,
  QUOTA_USED_CRITICAL_THRESHOLD,
} from '../utils/displayUtils.js';
import { formatResetTime } from '../utils/formatters.js';

interface QuotaDisplayProps {
  remaining: number | undefined;
  limit: number | undefined;
  resetTime?: string;
  terse?: boolean;
  forceShow?: boolean;
  lowercase?: boolean;
}

export const QuotaDisplay: React.FC<QuotaDisplayProps> = ({
  remaining,
  limit,
  resetTime,
  terse = false,
  forceShow = false,
  lowercase = false,
}) => {
  if (remaining === undefined || limit === undefined || limit === 0) {
    return null;
  }

  const usedPercentage = 100 - (remaining / limit) * 100;

  if (!forceShow && usedPercentage < QUOTA_USED_WARNING_THRESHOLD) {
    return null;
  }

  const color = getUsedStatusColor(usedPercentage, {
    warning: QUOTA_USED_WARNING_THRESHOLD,
    critical: QUOTA_USED_CRITICAL_THRESHOLD,
  });

  let text: string;
  if (remaining === 0) {
    const resetMsg = resetTime
      ? `, resets in ${formatResetTime(resetTime, 'terse')}`
      : '';
    text = terse ? 'Limit reached' : `Limit reached${resetMsg}`;
  } else {
    text = terse
      ? `${usedPercentage.toFixed(0)}%`
      : `${usedPercentage.toFixed(0)}% used${
          resetTime
            ? ` (Limit resets in ${formatResetTime(resetTime, 'terse')})`
            : ''
        }`;
  }

  if (lowercase) {
    text = text.toLowerCase();
  }

  return <Text color={color}>{text}</Text>;
};
