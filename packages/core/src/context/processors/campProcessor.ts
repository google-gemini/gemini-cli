/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CAMPProcessor: Automates CAMP §24 (Context Re-initialization Protocol).
 *
 * When triggered by 'retained_exceeded', this processor:
 * 1. Captures nodes being evicted from context.
 * 2. Files an AAAK diary entry to the agent's MemPalace palace via camp_proxy.py.
 * 3. Injects a 'Mandate Snapshot' into the replacement RollingSummary node so the
 *    agent preserves its persona and CAMP mandates after truncation.
 *
 * The diary write is best-effort: failures are logged but never block eviction.
 */

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { JSONSchemaType } from 'ajv';
import type {
  ContextProcessor,
  ProcessArgs,
  BackstopTargetOptions,
} from '../pipeline.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import type { ConcreteNode, RollingSummary } from '../graph/types.js';
import { debugLogger } from '../../utils/debugLogger.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const CAMP_PROXY_PATH = '/home/rrs/AI/camp_proxy.py';
const PYTHON_BIN = '/home/rrs/.local/share/pipx/venvs/mempalace/bin/python3';
const DIARY_WRITE_TIMEOUT_MS = 5000;

/** Map from lowercase agent name to palace path. */
const PALACE_PATHS: Record<string, string> = {
  rickxy: '/home/rrs/AI/GEMINI/palace',
  gemini: '/home/rrs/AI/GEMINI/palace',
  priyasi: '/home/rrs/AI/GEMINI_PRIYA/palace',
};

// ── Options ────────────────────────────────────────────────────────────────────

export interface CAMPProcessorOptions extends BackstopTargetOptions {
  /** Agent name used for MemPalace attribution (e.g. 'RickXy'). */
  agentName: string;
  /**
   * Override for the MemPalace palace path.
   * If omitted, derived from agentName via PALACE_PATHS map.
   */
  palacePath?: string;
}

export const CAMPProcessorOptionsSchema: JSONSchemaType<CAMPProcessorOptions> =
  {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        enum: ['incremental', 'freeNTokens', 'max'],
        nullable: true,
      },
      freeTokensTarget: { type: 'number', nullable: true },
      agentName: { type: 'string' },
      palacePath: { type: 'string', nullable: true },
    },
    required: ['agentName'],
  };

// ── Diary helpers ──────────────────────────────────────────────────────────────

/** Extract a brief plain-text summary from evicted nodes for the AAAK entry. */
function summariseNodes(nodes: ConcreteNode[]): string {
  const parts: string[] = [];
  for (const n of nodes.slice(0, 8)) {
    if (n.type === 'AGENT_THOUGHT' && 'text' in n) {
      parts.push(String(n.text).slice(0, 100).replace(/\s+/g, ' '));
    } else if (
      n.type === 'TOOL_EXECUTION' &&
      'toolName' in n &&
      'observation' in n
    ) {
      const obs =
        typeof n.observation === 'string'
          ? n.observation.slice(0, 60)
          : JSON.stringify(n.observation).slice(0, 60);
      parts.push(`tool:${String(n.toolName)}→${obs}`);
    } else if (n.type === 'ROLLING_SUMMARY' && 'text' in n) {
      parts.push(String(n.text).slice(0, 100).replace(/\s+/g, ' '));
    }
  }
  return parts.join(' | ') || 'context.evicted';
}

/** Build an AAAK-format diary entry for the eviction event. */
function buildAaakEntry(
  agentName: string,
  nodes: ConcreteNode[],
  tokenCount: number,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const summary = summariseNodes(nodes);
  return `EVICT:${date}|agent:${agentName},nodes:${nodes.length},tokens:~${tokenCount}|${summary}|GEM.ctx.auto-filed`;
}

/**
 * Write a diary entry to the agent's MemPalace via camp_proxy.py (JSON-RPC over stdio).
 * Always resolves — failure is non-fatal.
 */
async function writeMemPalaceDiary(
  agentName: string,
  palacePath: string,
  entry: string,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(
        PYTHON_BIN,
        [
          CAMP_PROXY_PATH,
          '--agent',
          agentName.toLowerCase(),
          '--palace',
          palacePath,
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch (e) {
      debugLogger.error('[CAMP] Failed to spawn camp_proxy.py', e);
      return settle();
    }

    const timeout = setTimeout(() => {
      debugLogger.log('[CAMP] diary write timed out — killing proxy');
      proc.kill();
      settle();
    }, DIARY_WRITE_TIMEOUT_MS);

    let buf = '';
    let msgId = 0;

    const send = (method: string, params: unknown, id?: number): void => {
      const req: Record<string, unknown> = { jsonrpc: '2.0', method, params };
      if (id !== undefined) req['id'] = id;
      proc.stdin!.write(JSON.stringify(req) + '\n');
    };

    proc.stdout!.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed: unknown = JSON.parse(line);
          if (
            typeof parsed !== 'object' ||
            parsed === null ||
            Array.isArray(parsed)
          )
            continue;
          const id = (parsed as { id?: unknown })['id'];
          const error = (parsed as { error?: unknown })['error'];
          if (id === 1) {
            // Initialize response received — send initialized notification then diary write
            send('notifications/initialized', {});
            send(
              'tools/call',
              {
                name: 'mempalace_diary_write',
                arguments: {
                  agent_name: agentName,
                  entry,
                  topic: 'eviction',
                },
              },
              ++msgId,
            );
          } else if (id === 2) {
            if (error) {
              debugLogger.error('[CAMP] diary write error', error);
            }
            clearTimeout(timeout);
            proc.stdin!.end();
          }
        } catch {
          // Ignore parse errors on partial lines
        }
      }
    });

    proc.on('close', () => {
      clearTimeout(timeout);
      settle();
    });
    proc.on('error', (e) => {
      debugLogger.error('[CAMP] camp_proxy.py process error', e);
      clearTimeout(timeout);
      settle();
    });

    // Kick off MCP handshake
    send(
      'initialize',
      {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'CAMPProcessor', version: '1.0.0' },
      },
      ++msgId,
    );
  });
}

// ── Processor factory ──────────────────────────────────────────────────────────

/**
 * Creates a CAMPProcessor that automates CAMP §24 context filing on eviction.
 */
export function createCAMPProcessor(
  id: string,
  env: ContextEnvironment,
  options: CAMPProcessorOptions,
): ContextProcessor {
  const palacePath =
    options.palacePath ??
    PALACE_PATHS[options.agentName.toLowerCase()] ??
    PALACE_PATHS['rickxy'];

  return {
    id,
    name: 'CAMPProcessor',
    process: async ({ targets }: ProcessArgs) => {
      if (targets.length === 0) return targets;

      try {
        // Select nodes to evict (skip the first USER_PROMPT anchor)
        const targetTokens = options.freeTokensTarget ?? Infinity;
        let tokenAccumulator = 0;
        const nodesToEvict: ConcreteNode[] = [];

        for (const node of targets) {
          if (node.id === targets[0].id && node.type === 'USER_PROMPT')
            continue;
          nodesToEvict.push(node);
          tokenAccumulator += env.tokenCalculator.getTokenCost(node);
          if (tokenAccumulator >= targetTokens) break;
        }

        if (nodesToEvict.length < 2) return targets;
        debugLogger.log(
          `[CAMP] Evicting ${nodesToEvict.length} nodes (~${tokenAccumulator} tokens) — filing to MemPalace`,
        );

        // Phase 1: file to MemPalace (best-effort, non-blocking)
        const entry = buildAaakEntry(
          options.agentName,
          nodesToEvict,
          tokenAccumulator,
        );
        writeMemPalaceDiary(options.agentName, palacePath, entry).catch((e) =>
          debugLogger.error('[CAMP] diary write rejected unexpectedly', e),
        );

        // Phase 2: inject Mandate Snapshot so the agent retains its persona
        const mandateSnapshot = [
          `[CAMP MANDATE SNAPSHOT]`,
          `Agent: @${options.agentName}`,
          `Context: This node replaces ${nodesToEvict.length} evicted nodes (CAMPProcessor §24).`,
          `Diary: Filed to MemPalace palace at ${palacePath}`,
          `Instruction: Maintain persona. Re-read ~/AI/multi-agent-memory-architecture.md if baseline unclear.`,
        ].join('\n');

        const summaryNode: RollingSummary = {
          id: randomUUID(),
          type: 'ROLLING_SUMMARY',
          timestamp: Date.now(),
          text: mandateSnapshot,
          abstractsIds: nodesToEvict.map((n) => n.id),
        };

        const evictedIds = new Set(nodesToEvict.map((n) => n.id));
        const returnedNodes = targets.filter((t) => !evictedIds.has(t.id));
        returnedNodes.unshift(summaryNode);

        return returnedNodes;
      } catch (e) {
        debugLogger.error(
          '[CAMP] CAMPProcessor failed — returning targets unchanged',
          e,
        );
        return targets;
      }
    },
  };
}
