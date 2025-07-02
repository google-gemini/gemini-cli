/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  metrics,
  Attributes,
  ValueType,
  Meter,
  Counter,
  Histogram,
} from '@opentelemetry/api';
import {
  SERVICE_NAME,
  METRIC_TOOL_CALL_COUNT,
  METRIC_TOOL_CALL_LATENCY,
  METRIC_API_REQUEST_COUNT,
  METRIC_API_REQUEST_LATENCY,
  METRIC_TOKEN_USAGE,
  METRIC_SESSION_COUNT,
  METRIC_FILE_OPERATION_COUNT,
  METRIC_WORK_CONTEXT_DETECTION_DURATION,
  METRIC_WORK_CONTEXT_DETECTION_SUCCESS,
  METRIC_WORK_CONTEXT_DETECTION_FAILURE,
  METRIC_DYNAMIC_PROMPT_USAGE,
  METRIC_DETECTED_PROJECT_TYPE,
  METRIC_DETECTED_LANGUAGE,
  METRIC_DETECTED_FRAMEWORK,
  METRIC_PROMPT_GENERATION_DURATION,
  METRIC_WORK_CONTEXT_CACHE_HITS,
} from './constants.js';
import { Config } from '../config/config.js';

export enum FileOperation {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
}

let cliMeter: Meter | undefined;
let toolCallCounter: Counter | undefined;
let toolCallLatencyHistogram: Histogram | undefined;
let apiRequestCounter: Counter | undefined;
let apiRequestLatencyHistogram: Histogram | undefined;
let tokenUsageCounter: Counter | undefined;
let fileOperationCounter: Counter | undefined;

// Dynamic prompt system metrics
let workContextDetectionDurationHistogram: Histogram | undefined;
let workContextDetectionSuccessCounter: Counter | undefined;
let workContextDetectionFailureCounter: Counter | undefined;
let dynamicPromptUsageCounter: Counter | undefined;
let detectedProjectTypeCounter: Counter | undefined;
let detectedLanguageCounter: Counter | undefined;
let detectedFrameworkCounter: Counter | undefined;
let promptGenerationDurationHistogram: Histogram | undefined;
let workContextCacheHitsCounter: Counter | undefined;

let isMetricsInitialized = false;

function getCommonAttributes(config: Config): Attributes {
  return {
    'session.id': config.getSessionId(),
  };
}

export function getMeter(): Meter | undefined {
  if (!cliMeter) {
    cliMeter = metrics.getMeter(SERVICE_NAME);
  }
  return cliMeter;
}

export function initializeMetrics(config: Config): void {
  if (isMetricsInitialized) return;

  const meter = getMeter();
  if (!meter) return;

  toolCallCounter = meter.createCounter(METRIC_TOOL_CALL_COUNT, {
    description: 'Counts tool calls, tagged by function name and success.',
    valueType: ValueType.INT,
  });
  toolCallLatencyHistogram = meter.createHistogram(METRIC_TOOL_CALL_LATENCY, {
    description: 'Latency of tool calls in milliseconds.',
    unit: 'ms',
    valueType: ValueType.INT,
  });
  apiRequestCounter = meter.createCounter(METRIC_API_REQUEST_COUNT, {
    description: 'Counts API requests, tagged by model and status.',
    valueType: ValueType.INT,
  });
  apiRequestLatencyHistogram = meter.createHistogram(
    METRIC_API_REQUEST_LATENCY,
    {
      description: 'Latency of API requests in milliseconds.',
      unit: 'ms',
      valueType: ValueType.INT,
    },
  );
  tokenUsageCounter = meter.createCounter(METRIC_TOKEN_USAGE, {
    description: 'Counts the total number of tokens used.',
    valueType: ValueType.INT,
  });
  fileOperationCounter = meter.createCounter(METRIC_FILE_OPERATION_COUNT, {
    description: 'Counts file operations (create, read, update).',
    valueType: ValueType.INT,
  });

  // Dynamic prompt system metrics
  workContextDetectionDurationHistogram = meter.createHistogram(
    METRIC_WORK_CONTEXT_DETECTION_DURATION,
    {
      description: 'Duration of work context detection in milliseconds.',
      unit: 'ms',
      valueType: ValueType.INT,
    },
  );
  workContextDetectionSuccessCounter = meter.createCounter(
    METRIC_WORK_CONTEXT_DETECTION_SUCCESS,
    {
      description: 'Count of successful work context detections.',
      valueType: ValueType.INT,
    },
  );
  workContextDetectionFailureCounter = meter.createCounter(
    METRIC_WORK_CONTEXT_DETECTION_FAILURE,
    {
      description: 'Count of failed work context detections.',
      valueType: ValueType.INT,
    },
  );
  dynamicPromptUsageCounter = meter.createCounter(METRIC_DYNAMIC_PROMPT_USAGE, {
    description: 'Count of dynamic prompt generations.',
    valueType: ValueType.INT,
  });
  detectedProjectTypeCounter = meter.createCounter(METRIC_DETECTED_PROJECT_TYPE, {
    description: 'Count of detected project types.',
    valueType: ValueType.INT,
  });
  detectedLanguageCounter = meter.createCounter(METRIC_DETECTED_LANGUAGE, {
    description: 'Count of detected languages.',
    valueType: ValueType.INT,
  });
  detectedFrameworkCounter = meter.createCounter(METRIC_DETECTED_FRAMEWORK, {
    description: 'Count of detected frameworks.',
    valueType: ValueType.INT,
  });
  promptGenerationDurationHistogram = meter.createHistogram(
    METRIC_PROMPT_GENERATION_DURATION,
    {
      description: 'Duration of prompt generation including dynamic sections in milliseconds.',
      unit: 'ms',
      valueType: ValueType.INT,
    },
  );
  workContextCacheHitsCounter = meter.createCounter(
    METRIC_WORK_CONTEXT_CACHE_HITS,
    {
      description: 'Count of work context cache hits.',
      valueType: ValueType.INT,
    },
  );

  const sessionCounter = meter.createCounter(METRIC_SESSION_COUNT, {
    description: 'Count of CLI sessions started.',
    valueType: ValueType.INT,
  });
  sessionCounter.add(1, getCommonAttributes(config));
  isMetricsInitialized = true;
}

export function recordToolCallMetrics(
  config: Config,
  functionName: string,
  durationMs: number,
  success: boolean,
  decision?: 'accept' | 'reject' | 'modify',
): void {
  if (!toolCallCounter || !toolCallLatencyHistogram || !isMetricsInitialized)
    return;

  const metricAttributes: Attributes = {
    ...getCommonAttributes(config),
    function_name: functionName,
    success,
    decision,
  };
  toolCallCounter.add(1, metricAttributes);
  toolCallLatencyHistogram.record(durationMs, {
    ...getCommonAttributes(config),
    function_name: functionName,
  });
}

export function recordTokenUsageMetrics(
  config: Config,
  model: string,
  tokenCount: number,
  type: 'input' | 'output' | 'thought' | 'cache' | 'tool',
): void {
  if (!tokenUsageCounter || !isMetricsInitialized) return;
  tokenUsageCounter.add(tokenCount, {
    ...getCommonAttributes(config),
    model,
    type,
  });
}

export function recordApiResponseMetrics(
  config: Config,
  model: string,
  durationMs: number,
  statusCode?: number | string,
  error?: string,
): void {
  if (
    !apiRequestCounter ||
    !apiRequestLatencyHistogram ||
    !isMetricsInitialized
  )
    return;
  const metricAttributes: Attributes = {
    ...getCommonAttributes(config),
    model,
    status_code: statusCode ?? (error ? 'error' : 'ok'),
  };
  apiRequestCounter.add(1, metricAttributes);
  apiRequestLatencyHistogram.record(durationMs, {
    ...getCommonAttributes(config),
    model,
  });
}

export function recordApiErrorMetrics(
  config: Config,
  model: string,
  durationMs: number,
  statusCode?: number | string,
  errorType?: string,
): void {
  if (
    !apiRequestCounter ||
    !apiRequestLatencyHistogram ||
    !isMetricsInitialized
  )
    return;
  const metricAttributes: Attributes = {
    ...getCommonAttributes(config),
    model,
    status_code: statusCode ?? 'error',
    error_type: errorType ?? 'unknown',
  };
  apiRequestCounter.add(1, metricAttributes);
  apiRequestLatencyHistogram.record(durationMs, {
    ...getCommonAttributes(config),
    model,
  });
}

export function recordFileOperationMetric(
  config: Config,
  operation: FileOperation,
  lines?: number,
  mimetype?: string,
  extension?: string,
): void {
  if (!fileOperationCounter || !isMetricsInitialized) return;
  const attributes: Attributes = {
    ...getCommonAttributes(config),
    operation,
  };
  if (lines !== undefined) attributes.lines = lines;
  if (mimetype !== undefined) attributes.mimetype = mimetype;
  if (extension !== undefined) attributes.extension = extension;
  fileOperationCounter.add(1, attributes);
}

/**
 * Record work context detection metrics
 */
export function recordWorkContextDetectionMetrics(
  config: Config,
  durationMs: number,
  success: boolean,
  error?: string,
): void {
  // Respect user privacy settings
  if (!config.getTelemetryEnabled() || !isMetricsInitialized) return;
  
  try {
    const attributes = getCommonAttributes(config);
    
    // Record duration
    if (workContextDetectionDurationHistogram) {
      workContextDetectionDurationHistogram.record(durationMs, attributes);
    }
    
    // Record success/failure
    if (success && workContextDetectionSuccessCounter) {
      workContextDetectionSuccessCounter.add(1, attributes);
    } else if (!success && workContextDetectionFailureCounter) {
      const failureAttributes = {
        ...attributes,
        error_type: error || 'unknown',
      };
      workContextDetectionFailureCounter.add(1, failureAttributes);
    }
  } catch (_metricError) {
    // Silently fail to avoid disrupting the main functionality
    // This ensures metric collection failures don't break the user experience
  }
}

/**
 * Record dynamic prompt usage metrics
 */
export function recordDynamicPromptUsageMetrics(
  config: Config,
  promptType: string,
  generationDurationMs?: number,
): void {
  // Respect user privacy settings
  if (!config.getTelemetryEnabled() || !isMetricsInitialized) return;
  
  try {
    const attributes = {
      ...getCommonAttributes(config),
      prompt_type: promptType,
    };
    
    if (dynamicPromptUsageCounter) {
      dynamicPromptUsageCounter.add(1, attributes);
    }
    
    if (generationDurationMs !== undefined && promptGenerationDurationHistogram) {
      promptGenerationDurationHistogram.record(generationDurationMs, attributes);
    }
  } catch (_metricError) {
    // Silently fail to avoid disrupting the main functionality
  }
}

/**
 * Record detected context type metrics
 */
export function recordDetectedContextTypeMetrics(
  config: Config,
  projectType?: string,
  language?: string,
  framework?: string,
): void {
  // Respect user privacy settings
  if (!config.getTelemetryEnabled() || !isMetricsInitialized) return;
  
  try {
    const baseAttributes = getCommonAttributes(config);
    
    if (projectType && detectedProjectTypeCounter) {
      detectedProjectTypeCounter.add(1, {
        ...baseAttributes,
        project_type: projectType,
      });
    }
    
    if (language && detectedLanguageCounter) {
      detectedLanguageCounter.add(1, {
        ...baseAttributes,
        language,
      });
    }
    
    if (framework && detectedFrameworkCounter) {
      detectedFrameworkCounter.add(1, {
        ...baseAttributes,
        framework,
      });
    }
  } catch (_metricError) {
    // Silently fail to avoid disrupting the main functionality
  }
}

/**
 * Record work context cache hit metrics
 */
export function recordWorkContextCacheHitMetrics(
  config: Config,
  cacheType: 'context' | 'prompt' | 'detection',
  hit: boolean,
): void {
  // Respect user privacy settings
  if (!config.getTelemetryEnabled() || !isMetricsInitialized) return;
  
  try {
    if (workContextCacheHitsCounter && hit) {
      workContextCacheHitsCounter.add(1, {
        ...getCommonAttributes(config),
        cache_type: cacheType,
      });
    }
  } catch (_metricError) {
    // Silently fail to avoid disrupting the main functionality
  }
}

/**
 * Record comprehensive prompt generation metrics including dynamic sections
 */
export function recordPromptGenerationMetrics(
  config: Config,
  totalDurationMs: number,
  dynamicSectionCount: number,
  staticSectionCount: number,
): void {
  // Respect user privacy settings
  if (!config.getTelemetryEnabled() || !isMetricsInitialized) return;
  
  try {
    if (promptGenerationDurationHistogram) {
      promptGenerationDurationHistogram.record(totalDurationMs, {
        ...getCommonAttributes(config),
        dynamic_sections: dynamicSectionCount,
        static_sections: staticSectionCount,
      });
    }
  } catch (_metricError) {
    // Silently fail to avoid disrupting the main functionality
  }
}
