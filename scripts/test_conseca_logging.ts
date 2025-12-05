/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  logConsecaPolicyGeneration,
  logConsecaVerdict,
  ConsecaPolicyGenerationEvent,
  ConsecaVerdictEvent,
  initializeTelemetry,
  shutdownTelemetry,
} from '../packages/core/src/telemetry/index.js';
import { Config } from '../packages/core/src/config/config.js';

async function main() {
  // Mock config - enable telemetry and set target to local file
  const config = {
    getTelemetryEnabled: () => true,
    getTelemetryTarget: () => 'local',
    getTelemetryOtlpEndpoint: () => '',
    getTelemetryOtlpProtocol: () => 'http',
    getTelemetryUseCollector: () => false,
    getTelemetryOutfile: () => '.gemini/telemetry_test.log',
    getSessionId: () => 'manual-test-session',
    getTelemetryLogPromptsEnabled: () => true,
    getDebugMode: () => true,
    isInteractive: () => true,
    getMcpClientManager: () => null,
    getMcpServers: () => ({}),
    getContentGeneratorConfig: () => ({}),
    getModel: () => 'test-model',
    getEmbeddingModel: () => 'test-embedding-model',
    getSandbox: () => false,
    getCoreTools: () => [],
    getApprovalMode: () => 'require-approval',
    getFileFilteringRespectGitIgnore: () => true,
    getOutputFormat: () => 'text',
    getExtensions: () => [],
  } as unknown as Config;

  console.log('Initializing telemetry...');
  initializeTelemetry(config);

  console.log('Logging Conseca Policy Generation Event...');
  const generationEvent = new ConsecaPolicyGenerationEvent(
    'Generate a policy for reading files',
    'Trusted content: none',
    'ALLOW read on *',
  );
  logConsecaPolicyGeneration(config, generationEvent);

  console.log('Logging Conseca Verdict Event...');
  const verdictEvent = new ConsecaVerdictEvent(
    'Read file.txt',
    'ALLOW read on *',
    'read_file(file.txt)',
    'ALLOW',
    'Policy allows reading any file',
  );
  logConsecaVerdict(config, verdictEvent);

  console.log('Shutting down telemetry...');
  await shutdownTelemetry(config);
  console.log('Done. Check .gemini/telemetry_test.log');
}

main().catch(console.error);
