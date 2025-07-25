/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChatRecordingService,
  type Config,
  uiTelemetryService,
  ResumedSessionData,
} from '@google/gemini-cli-core';
import { useMemo, useEffect } from 'react';
/**
 * Initializes the ChatRecordingService and connects it to telemetry.
 * If resumedSessionData is provided, it will resume the existing session instead of creating a new one.
 */
export const useChatRecordingService = (
  config: Config,
  resumedSessionData?: ResumedSessionData,
) => {
  const chatRecordingService = useMemo(
    () => new ChatRecordingService(config),
    [config],
  );

  useEffect(() => {
    chatRecordingService.initialize(resumedSessionData);
    uiTelemetryService.setChatRecordingService(chatRecordingService);
  }, [chatRecordingService, resumedSessionData]);

  return chatRecordingService;
};
