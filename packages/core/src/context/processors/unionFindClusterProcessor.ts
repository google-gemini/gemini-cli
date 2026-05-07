/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import type { JSONSchemaType } from 'ajv';
import type { ContextProcessor, ProcessArgs } from '../pipeline.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import { type ConcreteNode, NodeType } from '../graph/types.js';
import { ContextWindow } from '../contextWindow.js';
import { TFIDFEmbedder } from '../embeddingService.js';
import { ClusterSummarizer } from '../clusterSummarizer.js';
import { debugLogger } from '../../utils/debugLogger.js';

export interface UnionFindClusterProcessorOptions {
  mergeThreshold?: number;
  maxColdClusters?: number;
  graduateAt?: number;
  evictAt?: number;
}

export const UnionFindClusterProcessorOptionsSchema: JSONSchemaType<UnionFindClusterProcessorOptions> =
  {
    type: 'object',
    properties: {
      mergeThreshold: { type: 'number', nullable: true },
      maxColdClusters: { type: 'number', nullable: true },
      graduateAt: { type: 'number', nullable: true },
      evictAt: { type: 'number', nullable: true },
    },
    required: [],
  };

function extractNodeText(node: ConcreteNode): string {
  const payload = node.payload;
  if (payload.text) return payload.text;
  if (payload.functionResponse) {
    const raw = payload.functionResponse.response;
    if (typeof raw === 'string') return raw;
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  if (payload.functionCall) {
    return `${payload.functionCall.name}(${JSON.stringify(payload.functionCall.args)})`;
  }
  return '';
}

export function createUnionFindClusterProcessor(
  id: string,
  env: ContextEnvironment,
  options: UnionFindClusterProcessorOptions,
): ContextProcessor {
  const embedder = new TFIDFEmbedder();
  const summarizer = new ClusterSummarizer(
    env.llmClient,
    'gemini-3-flash-base',
  );

  const contextWindow = new ContextWindow(embedder, summarizer, {
    mergeThreshold: options.mergeThreshold ?? 0.15,
    maxColdClusters: options.maxColdClusters ?? 10,
    graduateAt: options.graduateAt ?? 26,
    evictAt: options.evictAt ?? 30,
  });

  const appendedNodeIds: Map<number, string> = new Map();
  let nextMsgId = 0;

  return {
    id,
    name: 'UnionFindClusterProcessor',
    process: async ({ targets }: ProcessArgs) => {
      if (targets.length < 3) return targets;

      for (const node of targets) {
        const text = extractNodeText(node);
        if (!text) continue;

        const msgId = nextMsgId++;
        contextWindow.append(text, new Date(node.timestamp).toISOString());
        appendedNodeIds.set(msgId, node.id);
      }

      if (contextWindow.coldClusterCount === 0) return targets;

      const forest = contextWindow.forest;
      const coldRoots = forest.roots();

      const clusteredNodeIds = new Set<string>();
      const clusterNodes: ConcreteNode[] = [];

      for (const root of coldRoots) {
        const memberMsgIds = forest.members(root);
        const memberNodeIds = memberMsgIds
          .map((mid) => appendedNodeIds.get(mid))
          .filter((nid): nid is string => nid !== undefined);

        if (memberNodeIds.length < 2) continue;

        const summaryText = forest.compact(root);
        for (const nid of memberNodeIds) {
          clusteredNodeIds.add(nid);
        }

        const earliestTarget = targets.find((t) =>
          memberNodeIds.includes(t.id),
        );
        const newId = randomUUID();

        clusterNodes.push({
          id: newId,
          turnId: newId,
          type: NodeType.SNAPSHOT,
          timestamp: earliestTarget?.timestamp ?? Date.now(),
          role: 'user',
          payload: { text: summaryText },
          abstractsIds: memberNodeIds,
        } as ConcreteNode);
      }

      if (clusterNodes.length === 0) return targets;

      void contextWindow.resolveDirty().catch((e) => {
        debugLogger.warn('UnionFindClusterProcessor resolveDirty failed', e);
      });

      const returnedNodes: ConcreteNode[] = [];
      let clusterInsertIndex = 0;

      for (const node of targets) {
        if (clusteredNodeIds.has(node.id)) {
          if (
            clusterInsertIndex < clusterNodes.length &&
            clusterNodes[clusterInsertIndex].abstractsIds?.includes(node.id)
          ) {
            returnedNodes.push(clusterNodes[clusterInsertIndex]);
            clusterInsertIndex++;
          }
        } else {
          returnedNodes.push(node);
        }
      }

      for (let i = clusterInsertIndex; i < clusterNodes.length; i++) {
        returnedNodes.push(clusterNodes[i]);
      }

      return returnedNodes;
    },
  };
}
