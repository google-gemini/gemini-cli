/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StatsDisplay } from './StatsDisplay.js';
import { useTranslation } from 'react-i18next';

interface SessionSummaryDisplayProps {
  duration: string;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
}) => {
  const { t } = useTranslation('ui');

  return <StatsDisplay title={t('sessionSummary.title')} duration={duration} />;
};
