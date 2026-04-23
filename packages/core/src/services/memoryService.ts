/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { constants as fsConstants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as Diff from 'diff';
import type { Config } from '../config/config.js';
import {
  SESSION_FILE_PREFIX,
  loadConversationRecord,
  type ConversationRecord,
} from './chatRecordingService.js';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents } from '../utils/events.js';
import { isNodeError } from '../utils/errors.js';
import { FRONTMATTER_REGEX, parseFrontmatter } from '../skills/skillLoader.js';
import { LocalAgentExecutor } from '../agents/local-executor.js';
import { SkillExtractionAgent } from '../agents/skill-extraction-agent.js';
import { getModelConfigAlias } from '../agents/registry.js';
import type { SubagentActivityEvent } from '../agents/types.js';
import { ExecutionLifecycleService } from './executionLifecycleService.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import { ResourceRegistry } from '../resources/resource-registry.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { PolicyDecision } from '../policy/types.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { Storage } from '../config/storage.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { READ_FILE_TOOL_NAME } from '../tools/tool-names.js';
import {
  applyParsedSkillPatches,
  hasParsedPatchHunks,
} from './memoryPatchUtils.js';

const LOCK_FILENAME = '.extraction.lock';
const STATE_FILENAME = '.extraction-state.json';
const LOCK_STALE_MS = 35 * 60 * 1000; // 35 minutes (exceeds agent's 30-min time limit)
const MIN_USER_MESSAGES = 10;
const MIN_IDLE_MS = 3 * 60 * 60 * 1000; // 3 hours
const MAX_SESSION_INDEX_SIZE = 50;
const MAX_NEW_SESSION_BATCH_SIZE = 10;

/**
 * Lock file content for coordinating across CLI instances.
 */
interface LockInfo {
  pid: number;
  startedAt: string;
}

function hasProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: unknown } {
  return obj !== null && typeof obj === 'object' && prop in obj;
}

function isStringProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: string } {
  return hasProperty(obj, prop) && typeof obj[prop] === 'string';
}

interface SessionVersion {
  sessionId: string;
  lastUpdated: string;
}

interface IndexedSession extends SessionVersion {
  filePath: string;
  summary?: string;
  userMessageCount: number;
}

/**
 * Metadata for a single extraction run.
 */
export interface ExtractionRun {
  runAt: string;
  sessionIds: string[];
  candidateSessions?: SessionVersion[];
  processedSessions?: SessionVersion[];
  skillsCreated: string[];
}

/**
 * Tracks extraction history with per-run metadata.
 */
export interface ExtractionState {
  runs: ExtractionRun[];
}

/**
 * Returns all session IDs that have been processed across all runs.
 */
export function getProcessedSessionIds(state: ExtractionState): Set<string> {
  const ids = new Set<string>();
  for (const run of state.runs) {
    const processedSessionIds =
      run.processedSessions?.map((session) => session.sessionId) ??
      run.sessionIds;
    for (const id of processedSessionIds) {
      ids.add(id);
    }
  }
  return ids;
}

function isLockInfo(value: unknown): value is LockInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pid' in value &&
    typeof value.pid === 'number' &&
    'startedAt' in value &&
    typeof value.startedAt === 'string'
  );
}

function isSessionVersion(value: unknown): value is SessionVersion {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sessionId' in value &&
    typeof value.sessionId === 'string' &&
    'lastUpdated' in value &&
    typeof value.lastUpdated === 'string'
  );
}

function normalizeSessionVersions(value: unknown): SessionVersion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isSessionVersion).map((session) => ({
    sessionId: session.sessionId,
    lastUpdated: session.lastUpdated,
  }));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function isExtractionRunLike(value: unknown): value is {
  runAt: string;
  sessionIds?: unknown;
  candidateSessions?: unknown;
  processedSessions?: unknown;
  skillsCreated: unknown;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'runAt' in value &&
    typeof value.runAt === 'string' &&
    'skillsCreated' in value
  );
}

function isExtractionState(value: unknown): value is { runs: unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'runs' in value &&
    Array.isArray(value.runs)
  );
}

function buildExtractionRun(value: unknown): ExtractionRun | null {
  if (!isExtractionRunLike(value)) {
    return null;
  }

  const candidateSessions = normalizeSessionVersions(value.candidateSessions);
  const processedSessions = normalizeSessionVersions(value.processedSessions);
  const sessionIds = normalizeStringArray(value.sessionIds);

  return {
    runAt: value.runAt,
    sessionIds:
      sessionIds.length > 0
        ? sessionIds
        : processedSessions.map((session) => session.sessionId),
    candidateSessions:
      candidateSessions.length > 0 ? candidateSessions : undefined,
    processedSessions:
      processedSessions.length > 0 ? processedSessions : undefined,
    skillsCreated: normalizeStringArray(value.skillsCreated),
  };
}

function getTimestampMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getSessionVersionKey(session: SessionVersion): string {
  return `${session.sessionId}\u0000${session.lastUpdated}`;
}

function hasLegacyRunProcessedSession(
  run: ExtractionRun,
  session: SessionVersion,
): boolean {
  return (
    run.sessionIds.includes(session.sessionId) &&
    getTimestampMs(run.runAt) >= getTimestampMs(session.lastUpdated)
  );
}

function isSessionVersionProcessed(
  state: ExtractionState,
  session: SessionVersion,
): boolean {
  const sessionKey = getSessionVersionKey(session);

  for (const run of state.runs) {
    if (
      run.processedSessions?.some(
        (processed) => getSessionVersionKey(processed) === sessionKey,
      )
    ) {
      return true;
    }

    if (!run.processedSessions && hasLegacyRunProcessedSession(run, session)) {
      return true;
    }
  }

  return false;
}

function getSessionAttemptCount(
  state: ExtractionState,
  session: SessionVersion,
): number {
  const sessionKey = getSessionVersionKey(session);
  let attempts = 0;

  for (const run of state.runs) {
    if (run.candidateSessions) {
      if (
        run.candidateSessions.some(
          (candidate) => getSessionVersionKey(candidate) === sessionKey,
        )
      ) {
        attempts++;
      }
      continue;
    }

    if (hasLegacyRunProcessedSession(run, session)) {
      attempts++;
    }
  }

  return attempts;
}

function compareIndexedSessions(a: IndexedSession, b: IndexedSession): number {
  const timestampDelta =
    getTimestampMs(b.lastUpdated) - getTimestampMs(a.lastUpdated);
  if (timestampDelta !== 0) {
    return timestampDelta;
  }

  if (a.filePath.endsWith('.jsonl') !== b.filePath.endsWith('.jsonl')) {
    return a.filePath.endsWith('.jsonl') ? -1 : 1;
  }

  return b.filePath.localeCompare(a.filePath);
}

function shouldReplaceIndexedSession(
  existing: IndexedSession,
  candidate: IndexedSession,
): boolean {
  return compareIndexedSessions(candidate, existing) < 0;
}

function isReadFileStartActivity(
  activity: SubagentActivityEvent,
): activity is SubagentActivityEvent & {
  data: { name: string; args?: { file_path?: unknown }; callId?: unknown };
} {
  return (
    activity.type === 'TOOL_CALL_START' &&
    activity.data['name'] === READ_FILE_TOOL_NAME
  );
}

function getResolvedReadFilePath(
  config: Config,
  activity: SubagentActivityEvent,
): string | null {
  if (!isReadFileStartActivity(activity)) {
    return null;
  }

  const args = activity.data.args;
  if (
    typeof args !== 'object' ||
    args === null ||
    !('file_path' in args) ||
    typeof args.file_path !== 'string'
  ) {
    return null;
  }

  return path.resolve(config.getTargetDir(), args.file_path);
}

function getReadFileStartCallId(
  activity: SubagentActivityEvent,
): string | null {
  if (
    !isReadFileStartActivity(activity) ||
    !isStringProperty(activity.data, 'callId')
  ) {
    return null;
  }

  return activity.data.callId;
}

function getCompletedReadFileCallId(
  activity: SubagentActivityEvent,
): string | null {
  if (
    activity.type !== 'TOOL_CALL_END' ||
    activity.data['name'] !== READ_FILE_TOOL_NAME ||
    !isStringProperty(activity.data, 'id')
  ) {
    return null;
  }

  return activity.data['id'];
}

function getFailedReadFileCallId(
  activity: SubagentActivityEvent,
): string | null {
  if (
    activity.type !== 'ERROR' ||
    activity.data['name'] !== READ_FILE_TOOL_NAME ||
    !isStringProperty(activity.data, 'callId')
  ) {
    return null;
  }

  return activity.data['callId'];
}

function getUserMessageCount(
  conversation: ConversationRecord & { userMessageCount?: number },
): number {
  return (
    conversation.userMessageCount ??
    conversation.messages.filter((message) => message.type === 'user').length
  );
}

function isSupportedSessionFile(fileName: string): boolean {
  return (
    fileName.startsWith(SESSION_FILE_PREFIX) &&
    (fileName.endsWith('.json') || fileName.endsWith('.jsonl'))
  );
}

/**
 * Attempts to acquire an exclusive lock file using O_CREAT | O_EXCL.
 * Returns true if the lock was acquired, false if another instance owns it.
 */
export async function tryAcquireLock(
  lockPath: string,
  retries = 1,
): Promise<boolean> {
  const lockInfo: LockInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };

  try {
    // Atomic create-if-not-exists
    const fd = await fs.open(
      lockPath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    );
    try {
      await fd.writeFile(JSON.stringify(lockInfo));
    } finally {
      await fd.close();
    }
    return true;
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'EEXIST') {
      // Lock exists — check if it's stale
      if (retries > 0 && (await isLockStale(lockPath))) {
        debugLogger.debug('[MemoryService] Cleaning up stale lock file');
        await releaseLock(lockPath);
        return tryAcquireLock(lockPath, retries - 1);
      }
      debugLogger.debug(
        '[MemoryService] Lock held by another instance, skipping',
      );
      return false;
    }
    throw error;
  }
}

/**
 * Checks if a lock file is stale (owner PID is dead or lock is too old).
 */
export async function isLockStale(lockPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(lockPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (!isLockInfo(parsed)) {
      return true; // Invalid lock data — treat as stale
    }
    const lockInfo = parsed;

    // Check if PID is still alive
    try {
      process.kill(lockInfo.pid, 0);
    } catch {
      // PID is dead — lock is stale
      return true;
    }

    // Check if lock is too old
    const lockAge = Date.now() - new Date(lockInfo.startedAt).getTime();
    if (lockAge > LOCK_STALE_MS) {
      return true;
    }

    return false;
  } catch {
    // Can't read lock — treat as stale
    return true;
  }
}

/**
 * Releases the lock file.
 */
export async function releaseLock(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return; // Already removed
    }
    debugLogger.warn(
      `[MemoryService] Failed to release lock: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Reads the extraction state file, or returns a default state.
 */
export async function readExtractionState(
  statePath: string,
): Promise<ExtractionState> {
  try {
    const content = await fs.readFile(statePath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (!isExtractionState(parsed)) {
      return { runs: [] };
    }

    const runs: ExtractionRun[] = [];
    for (const run of parsed.runs) {
      const normalizedRun = buildExtractionRun(run);
      if (!normalizedRun) continue;
      runs.push(normalizedRun);
    }

    return { runs };
  } catch (error) {
    debugLogger.debug(
      '[MemoryService] Failed to read extraction state:',
      error,
    );
    return { runs: [] };
  }
}

/**
 * Writes the extraction state atomically (temp file + rename).
 */
export async function writeExtractionState(
  statePath: string,
  state: ExtractionState,
): Promise<void> {
  const tmpPath = `${statePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2));
  await fs.rename(tmpPath, statePath);
}

/**
 * Determines if a conversation record should be considered for processing.
 * Filters out subagent sessions, sessions that haven't been idle long enough,
 * and sessions with too few user messages.
 */
function shouldProcessConversation(
  parsed: ConversationRecord & { userMessageCount?: number },
): boolean {
  // Skip subagent sessions
  if (parsed.kind === 'subagent') return false;

  // Skip sessions that are still active (not idle for 3+ hours)
  const lastUpdated = getTimestampMs(parsed.lastUpdated);
  if (Date.now() - lastUpdated < MIN_IDLE_MS) return false;

  // Skip sessions with too few user messages
  if (getUserMessageCount(parsed) < MIN_USER_MESSAGES) return false;

  return true;
}

/**
 * Scans the chats directory for eligible session files, loading metadata from
 * both JSONL and legacy JSON sessions, deduplicating migrated sessions by
 * session ID, and sorting by actual lastUpdated. We scan the full directory
 * here so already-processed recent sessions cannot permanently block older
 * backlog sessions from surfacing as new candidates.
 */
async function scanEligibleSessions(
  chatsDir: string,
): Promise<IndexedSession[]> {
  let allFiles: string[];
  try {
    allFiles = await fs.readdir(chatsDir);
  } catch {
    return [];
  }

  const candidates: Array<{ filePath: string; mtimeMs: number }> = [];
  for (const file of allFiles) {
    if (!isSupportedSessionFile(file)) continue;
    const filePath = path.join(chatsDir, file);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;
      candidates.push({ filePath, mtimeMs: stat.mtimeMs });
    } catch {
      // Skip files that disappeared between readdir and stat.
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const latestBySessionId = new Map<string, IndexedSession>();

  for (const { filePath } of candidates) {
    try {
      const conversation = await loadConversationRecord(filePath, {
        metadataOnly: true,
      });
      if (!conversation || !shouldProcessConversation(conversation)) continue;

      const indexedSession: IndexedSession = {
        sessionId: conversation.sessionId,
        lastUpdated: conversation.lastUpdated,
        filePath,
        summary: conversation.summary,
        userMessageCount: getUserMessageCount(conversation),
      };

      const existing = latestBySessionId.get(indexedSession.sessionId);
      if (!existing || shouldReplaceIndexedSession(existing, indexedSession)) {
        latestBySessionId.set(indexedSession.sessionId, indexedSession);
      }
    } catch {
      // Skip unreadable files
    }
  }

  return Array.from(latestBySessionId.values()).sort(compareIndexedSessions);
}

/**
 * Builds a session index for the extraction agent: a compact listing of all
 * eligible sessions with their summary, file path, and new/previously-processed status.
 * The agent can use read_file on paths to inspect sessions that look promising.
 *
 * Returns the index text, the list of selected new (unprocessed) session IDs,
 * and the surfaced candidate sessions for this run.
 */
export async function buildSessionIndex(
  chatsDir: string,
  state: ExtractionState,
): Promise<{
  sessionIndex: string;
  newSessionIds: string[];
  candidateSessions: IndexedSession[];
}> {
  const eligible = await scanEligibleSessions(chatsDir);

  if (eligible.length === 0) {
    return { sessionIndex: '', newSessionIds: [], candidateSessions: [] };
  }

  const newSessions: IndexedSession[] = [];
  const oldSessions: IndexedSession[] = [];
  for (const session of eligible) {
    if (isSessionVersionProcessed(state, session)) {
      oldSessions.push(session);
    } else {
      newSessions.push(session);
    }
  }

  newSessions.sort((a, b) => {
    const attemptDelta =
      getSessionAttemptCount(state, a) - getSessionAttemptCount(state, b);
    if (attemptDelta !== 0) {
      return attemptDelta;
    }
    return compareIndexedSessions(a, b);
  });

  const candidateSessions = newSessions.slice(0, MAX_NEW_SESSION_BATCH_SIZE);
  const remainingSlots = Math.max(
    0,
    MAX_SESSION_INDEX_SIZE - candidateSessions.length,
  );
  const displayedOldSessions = oldSessions.slice(0, remainingSlots);
  const candidateSessionIds = new Set(
    candidateSessions.map((session) => getSessionVersionKey(session)),
  );

  const lines = [...candidateSessions, ...displayedOldSessions].map(
    (session) => {
      const status = candidateSessionIds.has(getSessionVersionKey(session))
        ? '[NEW]'
        : '[old]';
      const summary = session.summary ?? '(no summary)';
      return `${status} ${summary} (${session.userMessageCount} user msgs) — ${session.filePath}`;
    },
  );

  return {
    sessionIndex: lines.join('\n'),
    newSessionIds: candidateSessions.map((session) => session.sessionId),
    candidateSessions,
  };
}

/**
 * Builds a summary of all existing skills — both memory-extracted skills
 * in the skillsDir and globally/workspace-discovered skills from the SkillManager.
 * This prevents the extraction agent from duplicating already-available skills.
 */
async function buildExistingSkillsSummary(
  skillsDir: string,
  config: Config,
): Promise<string> {
  const sections: string[] = [];

  // 1. Memory-extracted skills (from previous runs)
  const memorySkills: string[] = [];
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
      try {
        const content = await fs.readFile(skillPath, 'utf-8');
        const match = content.match(FRONTMATTER_REGEX);
        if (match) {
          const parsed = parseFrontmatter(match[1]);
          const name = parsed?.name ?? entry.name;
          const desc = parsed?.description ?? '';
          memorySkills.push(`- **${name}**: ${desc}`);
        } else {
          memorySkills.push(`- **${entry.name}**`);
        }
      } catch {
        // Skill directory without SKILL.md, skip
      }
    }
  } catch {
    // Skills directory doesn't exist yet
  }

  if (memorySkills.length > 0) {
    sections.push(
      `## Previously Extracted Skills (in ${skillsDir})\n${memorySkills.join('\n')}`,
    );
  }

  // 2. Discovered skills — categorize by source location
  try {
    const discoveredSkills = config.getSkillManager().getSkills();
    if (discoveredSkills.length > 0) {
      const userSkillsDir = Storage.getUserSkillsDir();
      const globalSkills: string[] = [];
      const workspaceSkills: string[] = [];
      const extensionSkills: string[] = [];
      const builtinSkills: string[] = [];

      for (const s of discoveredSkills) {
        const loc = s.location;
        if (loc.includes('/bundle/') || loc.includes('\\bundle\\')) {
          builtinSkills.push(`- **${s.name}**: ${s.description}`);
        } else if (loc.startsWith(userSkillsDir)) {
          globalSkills.push(`- **${s.name}**: ${s.description} (${loc})`);
        } else if (
          loc.includes('/extensions/') ||
          loc.includes('\\extensions\\')
        ) {
          extensionSkills.push(`- **${s.name}**: ${s.description}`);
        } else {
          workspaceSkills.push(`- **${s.name}**: ${s.description} (${loc})`);
        }
      }

      if (globalSkills.length > 0) {
        sections.push(
          `## Global Skills (~/.gemini/skills — do NOT duplicate)\n${globalSkills.join('\n')}`,
        );
      }
      if (workspaceSkills.length > 0) {
        sections.push(
          `## Workspace Skills (.gemini/skills — do NOT duplicate)\n${workspaceSkills.join('\n')}`,
        );
      }
      if (extensionSkills.length > 0) {
        sections.push(
          `## Extension Skills (from installed extensions — do NOT duplicate)\n${extensionSkills.join('\n')}`,
        );
      }
      if (builtinSkills.length > 0) {
        sections.push(
          `## Builtin Skills (bundled with CLI — do NOT duplicate)\n${builtinSkills.join('\n')}`,
        );
      }
    }
  } catch {
    // SkillManager not available
  }

  return sections.join('\n\n');
}

/**
 * Builds an AgentLoopContext from a Config for background agent execution.
 */
function buildAgentLoopContext(config: Config): AgentLoopContext {
  // Create a PolicyEngine that auto-approves all tool calls so the
  // background sub-agent never prompts the user for confirmation.
  const autoApprovePolicy = new PolicyEngine({
    rules: [
      {
        toolName: '*',
        decision: PolicyDecision.ALLOW,
        priority: 100,
      },
    ],
  });
  const autoApproveBus = new MessageBus(autoApprovePolicy);

  return {
    config,
    promptId: `skill-extraction-${randomUUID().slice(0, 8)}`,
    toolRegistry: config.getToolRegistry(),
    promptRegistry: new PromptRegistry(),
    resourceRegistry: new ResourceRegistry(),
    messageBus: autoApproveBus,
    geminiClient: config.getGeminiClient(),
    sandboxManager: config.sandboxManager,
  };
}

/**
 * Validates all .patch files in the skills directory using the `diff` library.
 * Parses each patch, reads the target file(s), and attempts a dry-run apply.
 * Removes patches that fail validation. Returns the filenames of valid patches.
 */
export async function validatePatches(
  skillsDir: string,
  config: Config,
): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(skillsDir);
  } catch {
    return [];
  }

  const patchFiles = entries.filter((e) => e.endsWith('.patch'));
  const validPatches: string[] = [];

  for (const patchFile of patchFiles) {
    const patchPath = path.join(skillsDir, patchFile);
    let valid = true;
    let reason = '';

    try {
      const patchContent = await fs.readFile(patchPath, 'utf-8');
      const parsedPatches = Diff.parsePatch(patchContent);

      if (!hasParsedPatchHunks(parsedPatches)) {
        valid = false;
        reason = 'no hunks found in patch';
      } else {
        const applied = await applyParsedSkillPatches(parsedPatches, config);
        if (!applied.success) {
          valid = false;
          switch (applied.reason) {
            case 'missingTargetPath':
              reason = 'missing target file path in patch header';
              break;
            case 'invalidPatchHeaders':
              reason = 'invalid diff headers';
              break;
            case 'outsideAllowedRoots':
              reason = `target file is outside skill roots: ${applied.targetPath}`;
              break;
            case 'newFileAlreadyExists':
              reason = `new file target already exists: ${applied.targetPath}`;
              break;
            case 'targetNotFound':
              reason = `target file not found: ${applied.targetPath}`;
              break;
            case 'doesNotApply':
              reason = `patch does not apply cleanly to ${applied.targetPath}`;
              break;
            default:
              reason = 'unknown patch validation failure';
              break;
          }
        }
      }
    } catch (err) {
      valid = false;
      reason = `failed to read or parse patch: ${err}`;
    }

    if (valid) {
      validPatches.push(patchFile);
      debugLogger.log(`[MemoryService] Patch validated: ${patchFile}`);
    } else {
      debugLogger.warn(
        `[MemoryService] Removing invalid patch ${patchFile}: ${reason}`,
      );
      try {
        await fs.unlink(patchPath);
      } catch {
        // Best-effort cleanup
      }
    }
  }

  return validPatches;
}

/**
 * Main entry point for the skill extraction background task.
 * Designed to be called fire-and-forget on session startup.
 *
 * Coordinates across multiple CLI instances via a lock file,
 * scans past sessions for reusable patterns, and runs a sub-agent
 * to extract and write SKILL.md files.
 */
export async function startMemoryService(config: Config): Promise<void> {
  const memoryDir = config.storage.getProjectMemoryTempDir();
  const skillsDir = config.storage.getProjectSkillsMemoryDir();
  const lockPath = path.join(memoryDir, LOCK_FILENAME);
  const statePath = path.join(memoryDir, STATE_FILENAME);
  const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');

  // Ensure directories exist
  await fs.mkdir(skillsDir, { recursive: true });

  debugLogger.log(`[MemoryService] Starting. Skills dir: ${skillsDir}`);

  // Try to acquire exclusive lock
  if (!(await tryAcquireLock(lockPath))) {
    debugLogger.log('[MemoryService] Skipped: lock held by another instance');
    return;
  }
  debugLogger.log('[MemoryService] Lock acquired');

  // Register with ExecutionLifecycleService for background tracking
  const abortController = new AbortController();
  const handle = ExecutionLifecycleService.createExecution(
    '', // no initial output
    () => abortController.abort(), // onKill
    'none',
    undefined, // no format injection
    'Skill extraction',
    'silent',
  );
  const executionId = handle.pid;

  const startTime = Date.now();
  let completionResult: { error: Error } | undefined;
  try {
    // Read extraction state
    const state = await readExtractionState(statePath);
    const previousRuns = state.runs.length;
    const previouslyProcessed = getProcessedSessionIds(state).size;
    debugLogger.log(
      `[MemoryService] State loaded: ${previousRuns} previous run(s), ${previouslyProcessed} session(s) already processed`,
    );

    // Build session index: all eligible sessions with summaries + file paths.
    // The agent decides which to read in full via read_file.
    const { sessionIndex, newSessionIds, candidateSessions } =
      await buildSessionIndex(chatsDir, state);

    const totalInIndex = sessionIndex ? sessionIndex.split('\n').length : 0;
    debugLogger.log(
      `[MemoryService] Session scan: ${totalInIndex} indexed session(s), ${candidateSessions.length} surfaced as new candidates`,
    );

    if (newSessionIds.length === 0) {
      debugLogger.log('[MemoryService] Skipped: no new sessions to process');
      return;
    }

    // Snapshot existing skill directories before extraction
    const skillsBefore = new Set<string>();
    const patchContentsBefore = new Map<string, string>();
    try {
      const entries = await fs.readdir(skillsDir);
      for (const e of entries) {
        if (e.endsWith('.patch')) {
          try {
            patchContentsBefore.set(
              e,
              await fs.readFile(path.join(skillsDir, e), 'utf-8'),
            );
          } catch {
            // Ignore unreadable existing patches.
          }
          continue;
        }
        skillsBefore.add(e);
      }
    } catch {
      // Empty skills dir
    }
    debugLogger.log(
      `[MemoryService] ${skillsBefore.size} existing skill(s) in memory`,
    );

    // Read existing skills for context (memory-extracted + global/workspace)
    const existingSkillsSummary = await buildExistingSkillsSummary(
      skillsDir,
      config,
    );
    if (existingSkillsSummary) {
      debugLogger.log(
        `[MemoryService] Existing skills context:\n${existingSkillsSummary}`,
      );
    }

    // Build agent definition and context
    const agentDefinition = SkillExtractionAgent(
      skillsDir,
      sessionIndex,
      existingSkillsSummary,
    );

    const context = buildAgentLoopContext(config);

    // Register the agent's model config since it's not going through AgentRegistry.
    const modelAlias = getModelConfigAlias(agentDefinition);
    config.modelConfigService.registerRuntimeModelConfig(modelAlias, {
      modelConfig: agentDefinition.modelConfig,
    });
    debugLogger.log(
      `[MemoryService] Starting extraction agent (model: ${agentDefinition.modelConfig.model}, maxTurns: 30, maxTime: 30min)`,
    );

    const candidateSessionsByPath = new Map(
      candidateSessions.map((session) => [
        path.resolve(session.filePath),
        session,
      ]),
    );
    const processedSessionKeys = new Set<string>();
    const pendingReadFileSessions = new Map<string, string>();

    // Create and run the extraction agent
    const executor = await LocalAgentExecutor.create(
      agentDefinition,
      context,
      (activity) => {
        const readFileCallId = getReadFileStartCallId(activity);
        if (readFileCallId) {
          const resolvedPath = getResolvedReadFilePath(config, activity);
          if (!resolvedPath) {
            return;
          }

          const session = candidateSessionsByPath.get(resolvedPath);
          if (!session) {
            return;
          }

          pendingReadFileSessions.set(
            readFileCallId,
            getSessionVersionKey(session),
          );
          return;
        }

        const completedReadFileCallId = getCompletedReadFileCallId(activity);
        if (completedReadFileCallId) {
          const sessionKey = pendingReadFileSessions.get(
            completedReadFileCallId,
          );
          if (!sessionKey) {
            return;
          }

          processedSessionKeys.add(sessionKey);
          pendingReadFileSessions.delete(completedReadFileCallId);
          return;
        }

        const failedReadFileCallId = getFailedReadFileCallId(activity);
        if (failedReadFileCallId) {
          pendingReadFileSessions.delete(failedReadFileCallId);
        }
      },
    );

    await executor.run(
      { request: 'Extract skills from the provided sessions.' },
      abortController.signal,
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Diff skills directory to find newly created skills
    const skillsCreated: string[] = [];
    try {
      const entriesAfter = await fs.readdir(skillsDir);
      for (const e of entriesAfter) {
        if (!skillsBefore.has(e) && !e.endsWith('.patch')) {
          skillsCreated.push(e);
        }
      }
    } catch {
      // Skills dir read failed
    }

    // Validate any .patch files the agent generated
    const validPatches = await validatePatches(skillsDir, config);
    const patchesCreatedThisRun: string[] = [];
    for (const patchFile of validPatches) {
      const patchPath = path.join(skillsDir, patchFile);
      let currentContent: string;
      try {
        currentContent = await fs.readFile(patchPath, 'utf-8');
      } catch {
        continue;
      }
      if (patchContentsBefore.get(patchFile) !== currentContent) {
        patchesCreatedThisRun.push(patchFile);
      }
    }
    if (validPatches.length > 0) {
      debugLogger.log(
        `[MemoryService] ${validPatches.length} valid patch(es) currently in inbox; ${patchesCreatedThisRun.length} created or updated this run`,
      );
    }

    const processedSessions = candidateSessions
      .filter((session) =>
        processedSessionKeys.has(getSessionVersionKey(session)),
      )
      .map((session) => ({
        sessionId: session.sessionId,
        lastUpdated: session.lastUpdated,
      }));

    // Record the run with full metadata
    const run: ExtractionRun = {
      runAt: new Date().toISOString(),
      sessionIds: processedSessions.map((session) => session.sessionId),
      candidateSessions: candidateSessions.map((session) => ({
        sessionId: session.sessionId,
        lastUpdated: session.lastUpdated,
      })),
      processedSessions,
      skillsCreated,
    };
    const updatedState: ExtractionState = {
      runs: [...state.runs, run],
    };
    await writeExtractionState(statePath, updatedState);

    if (skillsCreated.length > 0 || patchesCreatedThisRun.length > 0) {
      const completionParts: string[] = [];
      if (skillsCreated.length > 0) {
        completionParts.push(
          `created ${skillsCreated.length} skill(s): ${skillsCreated.join(', ')}`,
        );
      }
      if (patchesCreatedThisRun.length > 0) {
        completionParts.push(
          `prepared ${patchesCreatedThisRun.length} patch(es): ${patchesCreatedThisRun.join(', ')}`,
        );
      }
      debugLogger.log(
        `[MemoryService] Completed in ${elapsed}s. ${completionParts.join('; ')} (read ${processedSessions.length}/${candidateSessions.length} surfaced session(s))`,
      );
      const feedbackParts: string[] = [];
      if (skillsCreated.length > 0) {
        feedbackParts.push(
          `${skillsCreated.length} new skill${skillsCreated.length > 1 ? 's' : ''} extracted from past sessions: ${skillsCreated.join(', ')}`,
        );
      }
      if (patchesCreatedThisRun.length > 0) {
        feedbackParts.push(
          `${patchesCreatedThisRun.length} skill update${patchesCreatedThisRun.length > 1 ? 's' : ''} extracted from past sessions`,
        );
      }
      coreEvents.emitFeedback(
        'info',
        `${feedbackParts.join('. ')}. Use /memory inbox to review.`,
      );
    } else {
      debugLogger.log(
        `[MemoryService] Completed in ${elapsed}s. No new skills or patches created (read ${processedSessions.length}/${candidateSessions.length} surfaced session(s))`,
      );
    }
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (abortController.signal.aborted) {
      debugLogger.log(`[MemoryService] Cancelled after ${elapsed}s`);
    } else {
      debugLogger.log(
        `[MemoryService] Failed after ${elapsed}s: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    completionResult = {
      error: error instanceof Error ? error : new Error(String(error)),
    };
    return;
  } finally {
    await releaseLock(lockPath);
    debugLogger.log('[MemoryService] Lock released');
    if (executionId !== undefined) {
      ExecutionLifecycleService.completeExecution(
        executionId,
        completionResult,
      );
    }
  }
}
