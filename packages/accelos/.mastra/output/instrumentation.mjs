import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ExportResultCode } from '@opentelemetry/core';
import { OTLPTraceExporter as OTLPGrpcExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPTraceExporter as OTLPHttpExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
  AlwaysOffSampler,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { telemetry } from './telemetry-config.mjs';

globalThis.___MASTRA_TELEMETRY___ = true;

class CompositeExporter {
  constructor(exporters) {
    this.exporters = exporters;
  }
  export(spans, resultCallback) {
    const telemetryTraceIds = new Set(
      spans.filter((span) => {
        const attrs = span.attributes || {};
        const httpTarget = attrs["http.target"];
        return httpTarget === "/api/telemetry";
      }).map((span) => span.spanContext().traceId)
    );
    const filteredSpans = spans.filter((span) => !telemetryTraceIds.has(span.spanContext().traceId));
    if (filteredSpans.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }
    void Promise.all(
      this.exporters.map(
        (exporter) => new Promise((resolve) => {
          if (exporter.export) {
            exporter.export(filteredSpans, resolve);
          } else {
            resolve({ code: ExportResultCode.FAILED });
          }
        })
      )
    ).then((results) => {
      const hasError = results.some((r) => r.code === ExportResultCode.FAILED);
      resultCallback({
        code: hasError ? ExportResultCode.FAILED : ExportResultCode.SUCCESS
      });
    }).catch((error) => {
      console.error("[CompositeExporter] Export error:", error);
      resultCallback({ code: ExportResultCode.FAILED, error });
    });
  }
  shutdown() {
    return Promise.all(this.exporters.map((e) => e.shutdown?.() ?? Promise.resolve())).then(() => void 0);
  }
  forceFlush() {
    return Promise.all(this.exporters.map((e) => e.forceFlush?.() ?? Promise.resolve())).then(() => void 0);
  }
};

function getSampler(config) {
  if (!config.sampling) {
    return new AlwaysOnSampler();
  }

  if (!config.enabled) {
    return new AlwaysOffSampler();
  }

  switch (config.sampling.type) {
    case 'ratio':
      return new TraceIdRatioBasedSampler(config.sampling.probability);
    case 'always_on':
      return new AlwaysOnSampler();
    case 'always_off':
      return new AlwaysOffSampler();
    case 'parent_based':
      const rootSampler = new TraceIdRatioBasedSampler(config.sampling.root?.probability || 1.0);
      return new ParentBasedSampler({ root: rootSampler });
    default:
      return new AlwaysOnSampler();
  }
}

async function getExporters(config) {
  const exporters = [];

  // Add local exporter by default
  if (!config.disableLocalExport) {
    exporters.push(new OTLPHttpExporter({
      url: `http://localhost:${process.env.PORT ?? 4111}/api/telemetry`,
      headers: process.env.MASTRA_DEV ? {
        'x-mastra-dev-playground': 'true',
      } : {},
    }));
  }

  if (config.export?.type === 'otlp') {
    if (config.export?.protocol === 'grpc') {
      exporters.push(new OTLPGrpcExporter({
        url: config.export.endpoint,
        headers: config.export.headers,
      }));
    } else {
      exporters.push(new OTLPHttpExporter({
        url: config.export.endpoint,
        headers: config.export.headers,
      }));
    }
  } else if (config.export?.type === 'custom') {
    exporters.push(config.export.exporter);
  }

  return exporters
}

const sampler = getSampler(telemetry);
const exporters = await getExporters(telemetry);
const compositeExporter = new CompositeExporter(exporters);

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: telemetry.serviceName || 'default-service',
  }),
  sampler,
  traceExporter: compositeExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

if (telemetry.enabled !== false) {
  sdk.start();

  // gracefully shut down the SDK on process exit
  process.on('SIGTERM', () => {
    sdk.shutdown().catch(() => {
      // do nothing
    });
  });
}


