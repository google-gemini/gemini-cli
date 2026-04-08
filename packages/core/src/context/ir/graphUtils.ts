/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Episode, Task, IrNode, AgentThought, ToolExecution, MaskedTool, UserPrompt, AgentYield, SystemEvent, Snapshot, RollingSummary } from './types.js';
import type { ContextTracer } from '../tracer.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type { ContextEnvironment } from '../sidecar/environment.js';

export function isEpisode(node: IrNode): node is Episode {
  return node.type === 'EPISODE';
}

export function isTask(node: IrNode): node is Task {
  return node.type === 'TASK';
}

export function isAgentThought(node: IrNode): node is AgentThought {
  return node.type === 'AGENT_THOUGHT';
}

export function isToolExecution(node: IrNode): node is ToolExecution {
  return node.type === 'TOOL_EXECUTION';
}

export function isMaskedTool(node: IrNode): node is MaskedTool {
  return node.type === 'MASKED_TOOL';
}

export function isUserPrompt(node: IrNode): node is UserPrompt {
  return node.type === 'USER_PROMPT';
}

export function isAgentYield(node: IrNode): node is AgentYield {
  return node.type === 'AGENT_YIELD';
}

export function isSystemEvent(node: IrNode): node is SystemEvent {
  return node.type === 'SYSTEM_EVENT';
}

export function isSnapshot(node: IrNode): node is Snapshot {
  return node.type === 'SNAPSHOT';
}

export function isRollingSummary(node: IrNode): node is RollingSummary {
  return node.type === 'ROLLING_SUMMARY';
}

/**
 * Generates a computed view of the pristine log.
 * Sweeps backwards (newest to oldest), tracking rolling tokens.
 * When rollingTokens > retainedTokens, it injects the "best" available ready variant
 * (snapshot > summary > masked) instead of the raw text.
 * Handles N-to-1 variant skipping automatically.
 */

export function generateWorkingBufferView_OLD(
  pristineEpisodes: Episode[],
  retainedTokens: number,
  tracer: ContextTracer,
  env: ContextEnvironment,
): Episode[] {
  const currentEpisodes: Episode[] = [];
  let rollingTokens = 0;
  const skippedIds = new Set<string>();
  tracer.logEvent('ViewGenerator', 'Generating Working Buffer View');

  for (let i = pristineEpisodes.length - 1; i >= 0; i--) {
    const ep = pristineEpisodes[i];

    // If this episode was already replaced by an N-to-1 Snapshot injected earlier in the sweep, skip it entirely!
    if (skippedIds.has(ep.id)) {
      tracer.logEvent(
        'ViewGenerator',
        `Skipping episode [${ep.id}] due to N-to-1 replacement.`,
      );
      continue;
    }

    let projectedTrigger: typeof ep.trigger;

    if (isUserPrompt(ep.trigger)) {
      projectedTrigger = {
        ...ep.trigger,
        metadata: {
          ...ep.trigger.metadata,
          transformations: [...(ep.trigger.metadata?.transformations || [])],
        },
        semanticParts: ep.trigger.semanticParts.map((sp) => ({ ...sp })),
      };
    } else {
      projectedTrigger = {
        ...ep.trigger,
        metadata: {
          ...ep.trigger.metadata,
          transformations: [...(ep.trigger.metadata?.transformations || [])],
        },
      };
    }

    let projectedEp: Episode = {
      ...ep,
      type: 'EPISODE',
      trigger: projectedTrigger,
      steps: ep.steps.map((step) => ({
        ...step,
        metadata: {
          ...step.metadata,
          transformations: [...(step.metadata?.transformations || [])],
        },
      })),
      yield: ep.yield
        ? {
            ...ep.yield,
            metadata: {
              ...ep.yield.metadata,
              transformations: [...(ep.yield.metadata?.transformations || [])],
            },
          }
        : undefined,
    };

    const epTokens = env.tokenCalculator.calculateEpisodeListTokens([
      projectedEp,
    ]);

    if (rollingTokens > retainedTokens && ep.variants) {
      const snapshot = ep.variants['snapshot'];
      const summary = ep.variants['summary'];
      const masked = ep.variants['masked'];

      if (
        snapshot &&
        snapshot.status === 'ready' &&
        snapshot.type === 'snapshot'
      ) {
        projectedEp = snapshot.episode;
        // Mark all the episodes this snapshot covers to be skipped by the backwards sweep.
        for (const id of snapshot.replacedEpisodeIds) {
          skippedIds.add(id);
        }
        tracer.logEvent(
          'ViewGenerator',
          `Episode [${ep.id}] has SnapshotVariant. Selecting variant over raw text. Added [${snapshot.replacedEpisodeIds.join(',')}] to skippedIds.`,
        );
        debugLogger.log(
          `Opportunistically swapped Episodes [${snapshot.replacedEpisodeIds.join(', ')}] for pre-computed Snapshot variant.`,
        );
      } else if (
        summary &&
        summary.status === 'ready' &&
        summary.type === 'summary'
      ) {
        projectedEp.steps = [
          {
            id: ep.id + '-summary',
            type: 'AGENT_THOUGHT',
            text: summary.text,
            metadata: {
              originalTokens: epTokens,
              currentTokens: summary.recoveredTokens || 50,
              transformations: [
                {
                  processorName: 'AsyncSemanticCompressor',
                  action: 'SUMMARIZED',
                  timestamp: Date.now(),
                },
              ],
            },
          },
        ] as typeof projectedEp.steps;
        projectedEp.yield = undefined;
        tracer.logEvent(
          'ViewGenerator',
          `Episode [${ep.id}] has SummaryVariant. Selecting variant over raw text.`,
        );
        debugLogger.log(
          `Opportunistically swapped Episode ${ep.id} for pre-computed Summary variant.`,
        );
      } else if (
        masked &&
        masked.status === 'ready' &&
        masked.type === 'masked'
      ) {
        if (
          isUserPrompt(projectedEp.trigger) &&
          projectedEp.trigger.semanticParts &&
          projectedEp.trigger.semanticParts.length > 0
        ) {
          projectedEp.trigger.semanticParts[0].presentation = {
            text: masked.text,
            tokens: masked.recoveredTokens || 10,
          };
        }
        tracer.logEvent(
          'ViewGenerator',
          `Episode [${ep.id}] has MaskedVariant. Selecting variant over raw text.`,
        );
        debugLogger.log(
          `Opportunistically swapped Episode ${ep.id} for pre-computed Masked variant.`,
        );
      }
    }

    currentEpisodes.unshift(projectedEp);
    rollingTokens += env.tokenCalculator.calculateEpisodeListTokens([
      projectedEp,
    ]);
  }

  return currentEpisodes;
}
