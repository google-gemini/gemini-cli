#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import * as fs from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import {
  OTEL_DIR,
  BIN_DIR,
  fileExists,
  waitForPort,
  ensureBinary,
  manageTelemetrySettings,
  registerCleanup,
} from './telemetry_utils.js';

const OTEL_CONFIG_FILE = path.join(OTEL_DIR, 'collector-gcp.yaml');
const OTEL_LOG_FILE = path.join(OTEL_DIR, 'collector-gcp.log');

const getOtelConfigContent = (projectId) => `
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: "localhost:4317"
processors:
  batch:
    timeout: 1s
exporters:
  googlecloud:
    project: "${projectId}"
    metric:
      prefix: "custom.googleapis.com/gemini_cli"
    log:
      default_log_name: "gemini_cli"
  debug:
    verbosity: detailed
service:
  telemetry:
    logs:
      level: "debug"
    metrics:
      level: "none"
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [googlecloud]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [googlecloud, debug]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [googlecloud, debug]
`;

async function main() {
  console.log('✨ Starting Local Telemetry Exporter for Google Cloud ✨');

  let collectorProcess;
  let collectorLogFd;

  const originalSandboxSetting = manageTelemetrySettings(
    true,
    'http://localhost:4317',
    'gcp',
  );
  registerCleanup(
    () => [collectorProcess].filter((p) => p), // Function to get processes
    () => [collectorLogFd].filter((fd) => fd), // Function to get FDs
    originalSandboxSetting,
  );

  const projectId = process.env.OTLP_GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error(
      '🛑 Error: OTLP_GOOGLE_CLOUD_PROJECT environment variable is not exported.',
    );
    console.log(
      '   Please set it to your Google Cloud Project ID and try again.',
    );
    console.log('   `export OTLP_GOOGLE_CLOUD_PROJECT=your-project-id`');
    process.exit(1);
  }
  console.log(`✅ Using OTLP Google Cloud Project ID: ${projectId}`);

  console.log('\n🔑 Please ensure you are authenticated with Google Cloud:');
  console.log(
    '  - Run `gcloud auth application-default login` OR ensure `GOOGLE_APPLICATION_CREDENTIALS` environment variable points to a valid service account key.',
  );
  console.log(
    '  - The account needs "Cloud Trace Agent", "Monitoring Metric Writer", and "Logs Writer" roles.',
  );

  if (!fileExists(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

  const otelcolPath = await ensureBinary(
    'otelcol-contrib',
    'open-telemetry/opentelemetry-collector-releases',
    (version, platform, arch, ext) =>
      `otelcol-contrib_${version}_${platform}_${arch}.${ext}`,
    'otelcol-contrib',
    false, // isJaeger = false
  ).catch((e) => {
    console.error(`🛑 Error getting otelcol-contrib: ${e.message}`);
    return null;
  });
  if (!otelcolPath) process.exit(1);

  console.log('🧹 Cleaning up old processes and logs...');
  try {
    execSync('pkill -f "otelcol-contrib"');
    console.log('✅ Stopped existing otelcol-contrib process.');
  } catch {
    /* no-op */
  }
  try {
    fs.unlinkSync(OTEL_LOG_FILE);
    console.log('✅ Deleted old GCP collector log.');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(e);
  }

  if (!fileExists(OTEL_DIR)) fs.mkdirSync(OTEL_DIR, { recursive: true });
  fs.writeFileSync(OTEL_CONFIG_FILE, getOtelConfigContent(projectId));
  console.log(`📄 Wrote OTEL collector config to ${OTEL_CONFIG_FILE}`);

  const spawnEnv = { ...process.env };

  console.log(`🚀 Starting OTEL collector for GCP... Logs: ${OTEL_LOG_FILE}`);
  collectorLogFd = fs.openSync(OTEL_LOG_FILE, 'a');
  collectorProcess = spawn(otelcolPath, ['--config', OTEL_CONFIG_FILE], {
    stdio: ['ignore', collectorLogFd, collectorLogFd],
    env: spawnEnv,
  });

  console.log(
    `⏳ Waiting for OTEL collector to start (PID: ${collectorProcess.pid})...`,
  );

  try {
    await waitForPort(4317);
    console.log(`✅ OTEL collector started successfully on port 4317.`);
  } catch (err) {
    console.error(`🛑 Error: OTEL collector failed to start on port 4317.`);
    console.error(err.message);
    if (collectorProcess && collectorProcess.pid) {
      process.kill(collectorProcess.pid, 'SIGKILL');
    }
    if (fileExists(OTEL_LOG_FILE)) {
      console.error('📄 OTEL Collector Log Output:');
      console.error(fs.readFileSync(OTEL_LOG_FILE, 'utf-8'));
    }
    process.exit(1);
  }

  collectorProcess.on('error', (err) => {
    console.error(`${collectorProcess.spawnargs[0]} process error:`, err);
    process.exit(1);
  });

  console.log(`\n✨ Local OTEL collector for GCP is running.`);
  console.log(
    '\n🚀 To send telemetry, run the Gemini CLI in a separate terminal window.',
  );
  console.log(`\n📄 Collector logs are being written to: ${OTEL_LOG_FILE}`);
  console.log(
    `📄 Tail collector logs in another terminal: tail -f ${OTEL_LOG_FILE}`,
  );
  console.log(`\n📊 View your telemetry data in Google Cloud Console:`);
  console.log(
    `   - Logs: https://console.cloud.google.com/logs/query;query=logName%3D%22projects%2F${projectId}%2Flogs%2Fgemini_cli%22?project=${projectId}`,
  );
  console.log(
    `   - Metrics: https://console.cloud.google.com/monitoring/metrics-explorer?project=${projectId}`,
  );
  console.log(
    `   - Traces: https://console.cloud.google.com/traces/list?project=${projectId}`,
  );
  console.log(`\nPress Ctrl+C to exit.`);
}

main();
