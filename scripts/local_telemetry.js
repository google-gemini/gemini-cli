#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import fs from 'fs';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  BIN_DIR,
  OTEL_DIR,
  ensureBinary,
  fileExists,
  manageTelemetrySettings,
  registerCleanup,
  waitForPort,
} from './telemetry_utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OTEL_CONFIG_FILE = path.join(OTEL_DIR, 'collector-local.yaml');
const OTEL_LOG_FILE = path.join(OTEL_DIR, 'collector.log');
const JAEGER_LOG_FILE = path.join(OTEL_DIR, 'jaeger.log');
const JAEGER_PORT = 16686;

// This configuration is for the primary otelcol-contrib instance.
// It receives from the CLI on 4317, exports traces to Jaeger on 14317,
// and sends metrics/logs to the debug log.
const OTEL_CONFIG_CONTENT = `
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: "localhost:4317"
processors:
  batch:
    timeout: 1s
exporters:
  otlp:
    endpoint: "localhost:14317"
    tls:
      insecure: true
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
      exporters: [otlp]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
`;

async function main() {
  // 1. Ensure binaries are available, downloading if necessary.
  // Binaries are stored in the project's .gemini/otel/bin directory
  // to avoid modifying the user's system.
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

  const jaegerPath = await ensureBinary(
    'jaeger',
    'jaegertracing/jaeger',
    (version, platform, arch, ext) =>
      `jaeger-${version}-${platform}-${arch}.${ext}`,
    'jaeger',
    true, // isJaeger = true
  ).catch((e) => {
    console.error(`🛑 Error getting jaeger: ${e.message}`);
    return null;
  });
  if (!jaegerPath) process.exit(1);

  // 2. Kill any existing processes to ensure a clean start.
  console.log('🧹 Cleaning up old processes and logs...');
  try {
    execSync('pkill -f "otelcol-contrib"');
    console.log('✅ Stopped existing otelcol-contrib process.');
  } catch (_e) {} // eslint-disable-line no-empty
  try {
    execSync('pkill -f "jaeger"');
    console.log('✅ Stopped existing jaeger process.');
  } catch (_e) {} // eslint-disable-line no-empty
  try {
    if (fileExists(OTEL_LOG_FILE)) fs.unlinkSync(OTEL_LOG_FILE);
    console.log('✅ Deleted old collector log.');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(e);
  }
  try {
    if (fileExists(JAEGER_LOG_FILE)) fs.unlinkSync(JAEGER_LOG_FILE);
    console.log('✅ Deleted old jaeger log.');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(e);
  }

  let jaegerProcess, collectorProcess;
  let jaegerLogFd, collectorLogFd;

  const originalSandboxSetting = manageTelemetrySettings(
    true,
    'http://localhost:4317',
    'local',
  );

  registerCleanup(
    () => [jaegerProcess, collectorProcess],
    () => [jaegerLogFd, collectorLogFd],
    originalSandboxSetting,
  );

  if (!fileExists(OTEL_DIR)) fs.mkdirSync(OTEL_DIR, { recursive: true });
  fs.writeFileSync(OTEL_CONFIG_FILE, OTEL_CONFIG_CONTENT);
  console.log('📄 Wrote OTEL collector config.');

  // Start Jaeger
  console.log(`🚀 Starting Jaeger service... Logs: ${JAEGER_LOG_FILE}`);
  jaegerLogFd = fs.openSync(JAEGER_LOG_FILE, 'a');
  jaegerProcess = spawn(
    jaegerPath,
    ['--set=receivers.otlp.protocols.grpc.endpoint=localhost:14317'],
    { stdio: ['ignore', jaegerLogFd, jaegerLogFd] },
  );
  console.log(`⏳ Waiting for Jaeger to start (PID: ${jaegerProcess.pid})...`);

  try {
    await waitForPort(JAEGER_PORT);
    console.log(`✅ Jaeger started successfully.`);
  } catch (_) {
    console.error(`🛑 Error: Jaeger failed to start on port ${JAEGER_PORT}.`);
    if (jaegerProcess && jaegerProcess.pid) {
      process.kill(jaegerProcess.pid, 'SIGKILL');
    }
    if (fileExists(JAEGER_LOG_FILE)) {
      console.error('📄 Jaeger Log Output:');
      console.error(fs.readFileSync(JAEGER_LOG_FILE, 'utf-8'));
    }
    process.exit(1);
  }

  // Start the primary OTEL collector
  console.log(`🚀 Starting OTEL collector... Logs: ${OTEL_LOG_FILE}`);
  collectorLogFd = fs.openSync(OTEL_LOG_FILE, 'a');
  collectorProcess = spawn(otelcolPath, ['--config', OTEL_CONFIG_FILE], {
    stdio: ['ignore', collectorLogFd, collectorLogFd],
  });
  console.log(
    `⏳ Waiting for OTEL collector to start (PID: ${collectorProcess.pid})...`,
  );

  try {
    await waitForPort(4317);
    console.log(`✅ OTEL collector started successfully.`);
  } catch (_) {
    console.error(`🛑 Error: OTEL collector failed to start on port 4317.`);
    if (collectorProcess && collectorProcess.pid) {
      process.kill(collectorProcess.pid, 'SIGKILL');
    }
    if (fileExists(OTEL_LOG_FILE)) {
      console.error('📄 OTEL Collector Log Output:');
      console.error(fs.readFileSync(OTEL_LOG_FILE, 'utf-8'));
    }
    process.exit(1);
  }

  [jaegerProcess, collectorProcess].forEach((proc) => {
    if (proc) {
      proc.on('error', (err) => {
        console.error(`${proc.spawnargs[0]} process error:`, err);
        process.exit(1);
      });
    }
  });

  console.log(`
✨ Local telemetry environment is running.`);
  console.log(
    `
🔎 View traces in the Jaeger UI: http://localhost:${JAEGER_PORT}`,
  );
  console.log(`📊 View metrics in the logs and metrics: ${OTEL_LOG_FILE}`);
  console.log(
    `
📄 Tail logs and metrics in another terminal: tail -f ${OTEL_LOG_FILE}`,
  );
  console.log(`
Press Ctrl+C to exit.`);
}

main();
