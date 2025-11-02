/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';

// Mock the ClearcutLogger module to prevent E2E tests from failing due to a missing generated file.
// The ClearcutLogger (which imports git-commit.js) is not needed for E2E test validation,
// as tests rely on the OpenTelemetry logger which writes to telemetry.log.
vi.mock(
  (await import('node:path')).resolve(
    process.cwd(),
    'packages/core/src/telemetry/clearcut-logger/clearcut-logger.js',
  ),
  () => ({
    ClearcutLogger: {
      getInstance: vi.fn(() => ({
        logStartSessionEvent: vi.fn(),
        logNewPromptEvent: vi.fn(),
        logToolCallEvent: vi.fn(),
        logToolOutputTruncatedEvent: vi.fn(),
        logFileOperationEvent: vi.fn(),
        logApiRequestEvent: vi.fn(),
        logApiResponseEvent: vi.fn(),
        logApiErrorEvent: vi.fn(),
        logChatCompressionEvent: vi.fn(),
        logFlashFallbackEvent: vi.fn(),
        logRipgrepFallbackEvent: vi.fn(),
        logLoopDetectedEvent: vi.fn(),
        logLoopDetectionDisabledEvent: vi.fn(),
        logNextSpeakerCheck: vi.fn(),
        logSlashCommandEvent: vi.fn(),
        logMalformedJsonResponseEvent: vi.fn(),
        logIdeConnectionEvent: vi.fn(),
        logConversationFinishedEvent: vi.fn(),
        logKittySequenceOverflowEvent: vi.fn(),
        logInvalidChunkEvent: vi.fn(),
        logContentRetryEvent: vi.fn(),
        logContentRetryFailureEvent: vi.fn(),
        logModelRoutingEvent: vi.fn(),
        logExtensionInstallEvent: vi.fn(),
        logExtensionUninstallEvent: vi.fn(),
        logExtensionUpdateEvent: vi.fn(),
        logExtensionEnableEvent: vi.fn(),
        logExtensionDisableEvent: vi.fn(),
        logSmartEditStrategyEvent: vi.fn(),
        logSmartEditCorrectionEvent: vi.fn(),
        logAgentStartEvent: vi.fn(),
        logAgentFinishEvent: vi.fn(),
        logWebFetchFallbackAttemptEvent: vi.fn(),
        logEndSessionEvent: vi.fn(),
      })),
      clearInstance: vi.fn(),
    },
  }),
);
