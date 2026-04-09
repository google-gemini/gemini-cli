/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Definition of a processor or worker to be instantiated in the graph.
 */
export type ProcessorConfig =
  | {
      processorId: 'ToolMaskingProcessor';
      options: { stringLengthThresholdTokens: number };
    }
  | { processorId: 'BlobDegradationProcessor'; options?: object }
  | {
      processorId: 'NodeDistillationProcessor';
      options: { nodeThresholdTokens: number };
    }
  | {
      processorId: 'NodeTruncationProcessor';
      options: { maxTokensPerNode: number };
    }
  | {
      processorId: 'StateSnapshotProcessor';
      options?: Record<string, unknown>;
    }
  | {
      processorId: 'HistoryTruncationProcessor';
      options?: Record<string, unknown>;
    };

export interface WorkerConfig {
  workerId: string;
  options?: Record<string, unknown>;
}

export type PipelineTrigger =
  | 'new_message'
  | 'retained_exceeded'
  | 'gc_backstop'
  | { type: 'timer'; intervalMs: number };

export interface PipelineDef {
  name: string;
  triggers: PipelineTrigger[];
  execution: 'blocking' | 'background';
  processors: ProcessorConfig[];
}

/**
 * The Data-Driven Schema for the Context Manager.
 */
export interface SidecarConfig {
  /** Defines the token ceilings and limits for the pipeline. */
  budget: {
    retainedTokens: number;
    maxTokens: number;
  };

  /** The execution graphs for context manipulation */
  pipelines: PipelineDef[];

  /** Background actors that generate data for pipelines */
  workers?: WorkerConfig[];
}
