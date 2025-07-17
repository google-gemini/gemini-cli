/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChatRecordingService,
  type Config,
  uiTelemetryService,
} from '@google/gemini-cli-core';
import { useMemo, useEffect } from 'react';

/**
 * Initializes the ChatRecordingService and connects it to telemetry.
 */
export const useChatRecordingService = (config: Config) => {
  const chatRecordingService = useMemo(
    () => new ChatRecordingService(config),
    [config],
  );

  useEffect(() => {
    chatRecordingService.initialize();
    // Connect auto-saving service to telemetry
    uiTelemetryService.setChatRecordingService(chatRecordingService);
  }, [chatRecordingService]);

  return chatRecordingService;
};
