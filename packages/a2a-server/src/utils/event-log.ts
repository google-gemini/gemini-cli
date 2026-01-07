/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { logger } from './logger.js';

const EVENTS_DIR = join(homedir(), '.gemini', 'background-task-events');
const MAX_RING_BUFFER_SIZE = 500;

/**
 * Standard event types emitted by the background agent system.
 * Use these constants when appending events for consistency.
 */
export const EventTypes = {
  /** Task state changed (submitted, working, completed, failed, etc.) */
  STATUS_UPDATE: 'status-update',
  /** Tool execution started */
  TOOL_EXECUTING: 'tool-executing',
  /** Tool execution completed successfully */
  TOOL_SUCCESS: 'tool-success',
  /** Tool execution failed */
  TOOL_ERROR: 'tool-error',
  /** Tool requires user approval */
  TOOL_APPROVAL: 'tool-approval',
  /** Agent generated text content */
  TEXT_CONTENT: 'text-content',
  /** Agent message (structured) */
  AGENT_MESSAGE: 'agent-message',
  /** File or artifact was created/modified */
  ARTIFACT_UPDATE: 'artifact-update',
  /** Thought/reasoning content */
  THOUGHT: 'thought',
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];

export type TaskPhase = 'planning' | 'coding' | 'testing' | 'fixing' | 'reviewing' | 'completing';

export interface TaskEvent {
  eventId: number;
  ts: string;
  type: string;
  summary: string;
  data?: unknown;
  // Phase/agent attribution
  phase?: TaskPhase;
  agentId?: string;
  agentName?: string;
  // Metrics for TUI
  toolCallId?: string;
  toolName?: string;
  toolStatus?: 'requested' | 'executing' | 'success' | 'error' | 'cancelled' | 'awaiting_approval';
}

// Task-level metrics for TUI dashboard
export interface TaskMetrics {
  taskId: string;
  state: string;
  startedAt: string;
  currentPhase: TaskPhase;
  toolCalls: number;
  completedTools: number;
  tokenEstimate: number;
  agents: AgentMetrics[];
}

export interface AgentMetrics {
  agentId: string;
  agentName: string;
  status: 'running' | 'done' | 'waiting' | 'failed';
  toolUses: number;
  tokenCount: number;
  elapsedMs: number;
}

// In-memory ring buffers per task
const ringBuffers = new Map<string, TaskEvent[]>();
const eventCounters = new Map<string, number>();
const eventListeners = new Map<string, Set<(event: TaskEvent) => void>>();

function ensureEventsDir(): void {
  if (!existsSync(EVENTS_DIR)) {
    mkdirSync(EVENTS_DIR, { recursive: true });
  }
}

function getEventFilePath(taskId: string): string {
  return join(EVENTS_DIR, `${taskId}.jsonl`);
}

/**
 * Extended options for appendTaskEvent
 */
export interface TaskEventOptions {
  phase?: TaskPhase;
  agentId?: string;
  agentName?: string;
  toolCallId?: string;
  toolName?: string;
  toolStatus?: TaskEvent['toolStatus'];
}

/**
 * Append an event to the task's event log
 */
export function appendTaskEvent(
  taskId: string,
  type: string,
  summary: string,
  data?: unknown,
  options?: TaskEventOptions,
): TaskEvent {
  ensureEventsDir();

  // Increment event counter
  const eventId = (eventCounters.get(taskId) ?? 0) + 1;
  eventCounters.set(taskId, eventId);

  const event: TaskEvent = {
    eventId,
    ts: new Date().toISOString(),
    type,
    summary,
    data,
    phase: options?.phase,
    agentId: options?.agentId,
    agentName: options?.agentName,
    toolCallId: options?.toolCallId,
    toolName: options?.toolName,
    toolStatus: options?.toolStatus,
  };

  // Append to JSONL file
  try {
    const filePath = getEventFilePath(taskId);
    appendFileSync(filePath, JSON.stringify(event) + '\n');
  } catch (err) {
    logger.error(`[EventLog] Failed to write event for ${taskId}:`, err);
  }

  // Add to ring buffer
  let buffer = ringBuffers.get(taskId);
  if (!buffer) {
    buffer = [];
    ringBuffers.set(taskId, buffer);
  }
  buffer.push(event);
  if (buffer.length > MAX_RING_BUFFER_SIZE) {
    buffer.shift();
  }

  // Notify listeners
  const listeners = eventListeners.get(taskId);
  if (listeners) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        logger.error(`[EventLog] Listener error for ${taskId}:`, err);
      }
    }
  }

  return event;
}

/**
 * Get the last N events from the ring buffer
 */
export function tailEvents(taskId: string, n: number = 50): TaskEvent[] {
  const buffer = ringBuffers.get(taskId);
  if (!buffer) {
    // Try to load from file
    return loadEventsFromFile(taskId).slice(-n);
  }
  return buffer.slice(-n);
}

/**
 * Get events after a specific eventId
 */
export function getEventsAfter(taskId: string, afterEventId: number): TaskEvent[] {
  const buffer = ringBuffers.get(taskId);
  if (buffer) {
    return buffer.filter((e) => e.eventId > afterEventId);
  }
  // Fallback to file
  return loadEventsFromFile(taskId).filter((e) => e.eventId > afterEventId);
}

/**
 * Get the last event ID for a task
 */
export function getLastEventId(taskId: string): number {
  return eventCounters.get(taskId) ?? 0;
}

/**
 * Subscribe to new events for a task
 */
export function subscribeToEvents(
  taskId: string,
  listener: (event: TaskEvent) => void,
): () => void {
  let listeners = eventListeners.get(taskId);
  if (!listeners) {
    listeners = new Set();
    eventListeners.set(taskId, listeners);
  }
  listeners.add(listener);

  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) {
      eventListeners.delete(taskId);
    }
  };
}

/**
 * Load events from the JSONL file
 */
function loadEventsFromFile(taskId: string): TaskEvent[] {
  const filePath = getEventFilePath(taskId);
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const events: TaskEvent[] = [];
    for (const line of content.split('\n')) {
      if (line.trim()) {
        try {
          events.push(JSON.parse(line) as TaskEvent);
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Update in-memory state
    if (events.length > 0) {
      const lastEvent = events[events.length - 1];
      eventCounters.set(taskId, lastEvent.eventId);
      ringBuffers.set(taskId, events.slice(-MAX_RING_BUFFER_SIZE));
    }

    return events;
  } catch (err) {
    logger.error(`[EventLog] Failed to read events for ${taskId}:`, err);
    return [];
  }
}

/**
 * Initialize event log for a task (loads existing events into memory)
 */
export function initTaskEventLog(taskId: string): void {
  loadEventsFromFile(taskId);
}

/**
 * Create a human-friendly summary from an event
 */
export function summarizeEvent(type: string, data: unknown): string {
  if (!data || typeof data !== 'object') {
    return type;
  }

  const d = data as Record<string, unknown>;

  switch (type) {
    case 'status-update': {
      const state = (d['status'] as Record<string, unknown>)?.['state'];
      const message = d['message'] as { parts?: Array<{ kind: string; text?: string }> } | undefined;
      const textPart = message?.parts?.find((p) => p.kind === 'text');
      const text = textPart?.text?.substring(0, 100) || '';
      return `STATE=${state}${text ? `: ${text}...` : ''}`;
    }
    case 'artifact-update': {
      const name = d['name'] || 'output';
      const artifact = d['artifact'] as { parts?: Array<{ data?: string }> } | undefined;
      const chunk = artifact?.parts?.[0];
      const text = chunk?.data;
      const preview = text?.split('\n').pop()?.substring(0, 80) || '';
      return `TOOL OUTPUT ${name}: ${preview}`;
    }
    case 'tool-update': {
      const toolName = d['toolName'] || 'unknown';
      const toolStatus = d['status'] || 'running';
      return `TOOL ${toolName} ${toolStatus}`;
    }
    default:
      return type;
  }
}

/**
 * Infer phase from tool name or event type
 */
export function inferPhase(toolName?: string, eventType?: string): TaskPhase {
  if (!toolName && !eventType) return 'coding';

  const name = (toolName || eventType || '').toLowerCase();

  if (name.includes('read') || name.includes('search') || name.includes('list') || name.includes('find')) {
    return 'planning';
  }
  if (name.includes('test') || name.includes('npm test') || name.includes('vitest') || name.includes('jest')) {
    return 'testing';
  }
  if (name.includes('fix') || name.includes('patch') || name.includes('repair')) {
    return 'fixing';
  }
  if (name.includes('review') || name.includes('check') || name.includes('lint')) {
    return 'reviewing';
  }
  if (name.includes('complete') || name.includes('done') || name.includes('finish')) {
    return 'completing';
  }
  return 'coding';
}

/**
 * Compute metrics from events for TUI dashboard
 */
export function computeMetrics(taskId: string): TaskMetrics {
  const events = tailEvents(taskId, 500);
  const startEvent = events.find(e => e.type === 'status-update');

  let toolCalls = 0;
  let completedTools = 0;
  let tokenEstimate = 0;
  let currentPhase: TaskPhase = 'planning';
  let state = 'working';

  const agentMap = new Map<string, AgentMetrics>();

  for (const evt of events) {
    // Update state
    if (evt.type === 'status-update' && evt.data) {
      const d = evt.data as Record<string, unknown>;
      if (d['state']) state = d['state'] as string;
    }

    // Track phase
    if (evt.phase) currentPhase = evt.phase;

    // Track tool calls
    if (evt.toolStatus === 'requested') toolCalls++;
    if (evt.toolStatus === 'success' || evt.toolStatus === 'error') completedTools++;

    // Estimate tokens from text events
    if (evt.type === 'text-content' || evt.type === 'agent-message') {
      tokenEstimate += Math.ceil(evt.summary.length / 4);
    }

    // Track agent metrics
    const agentId = evt.agentId || 'main';
    if (!agentMap.has(agentId)) {
      agentMap.set(agentId, {
        agentId,
        agentName: evt.agentName || 'Main Agent',
        status: 'running',
        toolUses: 0,
        tokenCount: 0,
        elapsedMs: 0,
      });
    }
    const agent = agentMap.get(agentId)!;
    if (evt.toolStatus === 'success') agent.toolUses++;
    if (evt.type === 'text-content' || evt.type === 'agent-message') {
      agent.tokenCount += Math.ceil(evt.summary.length / 4);
    }
  }

  // Calculate elapsed
  const startedAt = startEvent?.ts || new Date().toISOString();
  const elapsedMs = Date.now() - new Date(startedAt).getTime();

  // Update agent elapsed
  for (const agent of agentMap.values()) {
    agent.elapsedMs = elapsedMs;
    if (state === 'completed' || state === 'failed') agent.status = 'done';
    if (state === 'input-required') agent.status = 'waiting';
  }

  return {
    taskId,
    state,
    startedAt,
    currentPhase,
    toolCalls,
    completedTools,
    tokenEstimate,
    agents: Array.from(agentMap.values()),
  };
}
