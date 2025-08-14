/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StatsDisplay } from './StatsDisplay.js';
import { useI18n } from '../../i18n/hooks.js';

interface SessionSummaryDisplayProps {
  duration: string;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
}) => {
  const { t } = useI18n();
  return (
    <StatsDisplay title={t('ui.session.goodbye')} duration={duration} />
  );
};
