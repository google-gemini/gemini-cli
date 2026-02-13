/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config/config.js';

export const DEFAULT_DEEP_WORK_MAX_RUNS = 5;
export const DEFAULT_DEEP_WORK_MAX_TIME_MINUTES = 60;
const DEEP_WORK_DIR_NAME = 'deep-work';
const DEEP_WORK_STATE_FILE_NAME = 'state.json';

export type DeepWorkStatus =
  | 'configured'
  | 'ready'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'rejected';

export type DeepWorkReadinessVerdict = 'ready' | 'needs_answers' | 'reject';

export interface DeepWorkQuestion {
  id: string;
  question: string;
  required: boolean;
  answer: string;
  done: boolean;
  updatedAt: string;
}

export interface DeepWorkReadinessReport {
  verdict: DeepWorkReadinessVerdict;
  missingRequiredQuestionIds: string[];
  followUpQuestions: string[];
  blockingReasons: string[];
  singleShotRecommendation: boolean;
  recommendationText?: string;
  reviewer?: 'subagent' | 'heuristic';
  generatedAt: string;
}

export interface DeepWorkState {
  runId: string;
  status: DeepWorkStatus;
  prompt: string;
  approvedPlanPath: string | null;
  maxRuns: number;
  maxTimeMinutes: number;
  completionPromise: string | null;
  requiredQuestions: DeepWorkQuestion[];
  iteration: number;
  createdAt: string;
  startedAt: string | null;
  lastUpdatedAt: string;
  rejectionReason: string | null;
  readinessReport: DeepWorkReadinessReport | null;
}

const MULTI_STEP_KEYWORDS = [
  'implement',
  'refactor',
  'migrate',
  'architecture',
  'system',
  'workflow',
  'pipeline',
  'multiple',
  'across',
  'iterations',
  'loop',
  'phases',
  'build out',
  'full feature',
  'comprehensive',
  'end-to-end',
  'validation',
  'test suite',
  'multi-step',
  'deep',
];

const VALID_DEEP_WORK_STATUSES = new Set<DeepWorkStatus>([
  'configured',
  'ready',
  'running',
  'paused',
  'stopped',
  'completed',
  'rejected',
]);

const VALID_READINESS_VERDICTS = new Set<DeepWorkReadinessVerdict>([
  'ready',
  'needs_answers',
  'reject',
]);

function nowIsoString(): string {
  return new Date().toISOString();
}

function normalizeQuestionId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return `question-${randomUUID().slice(0, 8)}`;
  }
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeQuestion(
  question: Partial<DeepWorkQuestion>,
  index: number,
): DeepWorkQuestion {
  const answer = (question.answer ?? '').trim();
  const required = question.required ?? true;
  const doneFromInput = question.done ?? false;
  const done = required ? answer.length > 0 || doneFromInput : doneFromInput;

  return {
    id: normalizeQuestionId(question.id ?? `question-${index + 1}`),
    question: (question.question ?? '').trim(),
    required,
    answer,
    done,
    updatedAt: question.updatedAt ?? nowIsoString(),
  };
}

function normalizeQuestions(
  questions: Array<Partial<DeepWorkQuestion>> | undefined,
): DeepWorkQuestion[] {
  if (!questions || questions.length === 0) {
    return [];
  }

  const deduped = new Map<string, DeepWorkQuestion>();
  for (let i = 0; i < questions.length; i++) {
    const normalized = normalizeQuestion(questions[i], i);
    if (!normalized.question) {
      continue;
    }
    deduped.set(normalized.id, normalized);
  }

  return Array.from(deduped.values());
}

function sanitizeReadinessReport(
  input: unknown,
): DeepWorkReadinessReport | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const report = input as Partial<DeepWorkReadinessReport>;
  if (!report.verdict || !VALID_READINESS_VERDICTS.has(report.verdict)) {
    return null;
  }
  if (
    !Array.isArray(report.missingRequiredQuestionIds) ||
    !Array.isArray(report.followUpQuestions) ||
    !Array.isArray(report.blockingReasons)
  ) {
    return null;
  }

  return {
    verdict: report.verdict,
    missingRequiredQuestionIds: report.missingRequiredQuestionIds.filter(
      (item): item is string => typeof item === 'string',
    ),
    followUpQuestions: report.followUpQuestions.filter(
      (item): item is string => typeof item === 'string',
    ),
    blockingReasons: report.blockingReasons.filter(
      (item): item is string => typeof item === 'string',
    ),
    singleShotRecommendation: report.singleShotRecommendation === true,
    recommendationText:
      typeof report.recommendationText === 'string'
        ? report.recommendationText
        : undefined,
    reviewer: report.reviewer === 'subagent' ? 'subagent' : 'heuristic',
    generatedAt:
      typeof report.generatedAt === 'string'
        ? report.generatedAt
        : nowIsoString(),
  };
}

function buildDefaultState(): DeepWorkState {
  const now = nowIsoString();
  return {
    runId: `deep-work-${randomUUID().slice(0, 12)}`,
    status: 'configured',
    prompt: '',
    approvedPlanPath: null,
    maxRuns: DEFAULT_DEEP_WORK_MAX_RUNS,
    maxTimeMinutes: DEFAULT_DEEP_WORK_MAX_TIME_MINUTES,
    completionPromise: null,
    requiredQuestions: [],
    iteration: 0,
    createdAt: now,
    startedAt: null,
    lastUpdatedAt: now,
    rejectionReason: null,
    readinessReport: null,
  };
}

function sanitizeDeepWorkState(input: unknown): DeepWorkState {
  const base = buildDefaultState();
  if (!input || typeof input !== 'object') {
    return base;
  }

  const candidate = input as Partial<DeepWorkState>;
  return {
    runId:
      typeof candidate.runId === 'string' && candidate.runId.trim().length > 0
        ? candidate.runId
        : base.runId,
    status:
      typeof candidate.status === 'string'
        ? VALID_DEEP_WORK_STATUSES.has(candidate.status)
          ? candidate.status
          : base.status
        : base.status,
    prompt:
      typeof candidate.prompt === 'string' ? candidate.prompt : base.prompt,
    approvedPlanPath:
      typeof candidate.approvedPlanPath === 'string' &&
      candidate.approvedPlanPath.trim().length > 0
        ? candidate.approvedPlanPath
        : null,
    maxRuns:
      typeof candidate.maxRuns === 'number' && candidate.maxRuns > 0
        ? Math.floor(candidate.maxRuns)
        : base.maxRuns,
    maxTimeMinutes:
      typeof candidate.maxTimeMinutes === 'number' &&
      candidate.maxTimeMinutes > 0
        ? Math.floor(candidate.maxTimeMinutes)
        : base.maxTimeMinutes,
    completionPromise:
      typeof candidate.completionPromise === 'string' &&
      candidate.completionPromise.trim().length > 0
        ? candidate.completionPromise
        : null,
    requiredQuestions: normalizeQuestions(candidate.requiredQuestions),
    iteration:
      typeof candidate.iteration === 'number' && candidate.iteration >= 0
        ? Math.floor(candidate.iteration)
        : 0,
    createdAt:
      typeof candidate.createdAt === 'string'
        ? candidate.createdAt
        : base.createdAt,
    startedAt:
      typeof candidate.startedAt === 'string' ? candidate.startedAt : null,
    lastUpdatedAt:
      typeof candidate.lastUpdatedAt === 'string'
        ? candidate.lastUpdatedAt
        : base.lastUpdatedAt,
    rejectionReason:
      typeof candidate.rejectionReason === 'string'
        ? candidate.rejectionReason
        : null,
    readinessReport: sanitizeReadinessReport(candidate.readinessReport) ?? null,
  };
}

export function getDeepWorkStateDirectory(config: Config): string {
  return path.join(config.storage.getProjectTempDir(), DEEP_WORK_DIR_NAME);
}

export function getDeepWorkStatePath(config: Config): string {
  return path.join(
    getDeepWorkStateDirectory(config),
    DEEP_WORK_STATE_FILE_NAME,
  );
}

export async function loadDeepWorkState(
  config: Config,
): Promise<DeepWorkState | undefined> {
  try {
    const raw = await fs.readFile(getDeepWorkStatePath(config), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeDeepWorkState(parsed);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function saveDeepWorkState(
  config: Config,
  state: DeepWorkState,
): Promise<void> {
  const normalized = sanitizeDeepWorkState(state);
  normalized.lastUpdatedAt = nowIsoString();
  await fs.mkdir(getDeepWorkStateDirectory(config), { recursive: true });
  await fs.writeFile(
    getDeepWorkStatePath(config),
    JSON.stringify(normalized, null, 2),
    'utf-8',
  );
}

export async function loadOrCreateDeepWorkState(
  config: Config,
): Promise<DeepWorkState> {
  return (await loadDeepWorkState(config)) ?? buildDefaultState();
}

export function inferDeepWorkStatusFromReadiness(
  state: DeepWorkState,
): DeepWorkStatus {
  if (state.readinessReport?.verdict === 'ready') {
    return 'ready';
  }
  if (state.readinessReport?.verdict === 'reject') {
    return 'rejected';
  }
  return 'configured';
}

function looksSingleShot(prompt: string): boolean {
  const normalizedPrompt = prompt.trim().toLowerCase();
  if (!normalizedPrompt) {
    return false;
  }

  if (normalizedPrompt.length < 70) {
    return true;
  }

  const hasMultiStepSignal = MULTI_STEP_KEYWORDS.some((keyword) =>
    normalizedPrompt.includes(keyword),
  );

  if (hasMultiStepSignal) {
    return false;
  }

  const conjunctionCount =
    (normalizedPrompt.match(/\band\b/g) ?? []).length +
    (normalizedPrompt.match(/\bthen\b/g) ?? []).length;

  return conjunctionCount === 0;
}

export function evaluateDeepWorkReadinessHeuristic(
  state: DeepWorkState,
): DeepWorkReadinessReport {
  const missingRequiredQuestions = state.requiredQuestions
    .filter((q) => q.required && q.answer.trim().length === 0)
    .map((q) => q.id);

  const followUpQuestions = state.requiredQuestions
    .filter((q) => q.required && q.answer.trim().length === 0)
    .map((q) => `Please answer required question "${q.id}": ${q.question}`);

  const blockingReasons: string[] = [];

  if (!state.prompt.trim()) {
    blockingReasons.push('Deep Work prompt is required before starting.');
  }

  if (missingRequiredQuestions.length > 0) {
    blockingReasons.push(
      `Required questions missing answers: ${missingRequiredQuestions.join(', ')}.`,
    );
  }

  const singleShot = looksSingleShot(state.prompt);
  if (singleShot) {
    blockingReasons.push(
      'This looks like a single-shot/simple request; Deep Work is best for multi-step iterative tasks.',
    );
  }

  let verdict: DeepWorkReadinessVerdict = 'ready';
  if (singleShot) {
    verdict = 'reject';
  } else if (blockingReasons.length > 0) {
    verdict = 'needs_answers';
  }

  return {
    verdict,
    missingRequiredQuestionIds: missingRequiredQuestions,
    followUpQuestions,
    blockingReasons,
    singleShotRecommendation: singleShot,
    recommendationText: singleShot
      ? 'Use standard execution mode for single-step tasks. Switch to Deep Work for multi-iteration implementation work.'
      : undefined,
    reviewer: 'heuristic',
    generatedAt: nowIsoString(),
  };
}

export function upsertQuestions(
  state: DeepWorkState,
  questions: Array<Partial<DeepWorkQuestion>>,
): DeepWorkState {
  const normalized = normalizeQuestions(questions);
  const merged = new Map<string, DeepWorkQuestion>();
  for (const question of state.requiredQuestions) {
    merged.set(question.id, question);
  }
  for (const question of normalized) {
    merged.set(question.id, question);
  }

  return {
    ...state,
    requiredQuestions: Array.from(merged.values()),
    lastUpdatedAt: nowIsoString(),
  };
}
