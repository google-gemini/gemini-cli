/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { GoogleGenAI } from '@google/genai';

export const GEMINI_DIR = '.gemini';
export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'text-embedding-004';
export const PREVIEW_GEMINI_MODEL = 'gemini-2.5-pro';
export const DEFAULT_GUI_EDITOR = 'code';

export enum AuthType {
  API_KEY = 'api_key',
  ADC = 'adc',
  OAUTH = 'oauth',
}

export enum ApprovalMode {
  AUTO = 'auto',
  PROMPT = 'prompt',
  ALWAYS = 'always',
}

export enum GeminiEventType {
  Message = 'message',
  ToolCall = 'tool_call',
  ToolResult = 'tool_result',
  Status = 'status',
  Error = 'error',
}

export enum ToolConfirmationOutcome {
  ACCEPT = 'accept',
  REJECT = 'reject',
  MODIFY = 'modify',
}

export enum CoreToolCallStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum MCPServerStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
}

export enum MessageBusType {
  MAIN = 'main',
  AGENT = 'agent',
  DEBUG = 'debug',
}

export const EDIT_TOOL_NAMES = ['edit_file', 'create_file', 'delete_file', 'multi_edit_file'];

export const ExperimentFlags = {};

export class FatalAuthenticationError extends Error {
  constructor(message = 'Fatal authentication error') {
    super(message);
    this.name = 'FatalAuthenticationError';
  }
}

export const debugLogger = {
  warn: (...args: unknown[]) => console.warn('[DEBUG]', ...args),
  error: (...args: unknown[]) => console.error('[DEBUG]', ...args),
  info: (...args: unknown[]) => console.info('[DEBUG]', ...args),
  log: (...args: unknown[]) => console.log('[DEBUG]', ...args),
};

export class SimpleExtensionLoader {
  constructor(public extensions: unknown[] = []) {}
  getExtensions() {
    return this.extensions;
  }
}

export class GitService {
  constructor(public dir: string = process.cwd(), public storage: unknown = {}) {}
  async initialize() {
    return Promise.resolve();
  }
  async getDiff() {
    return '';
  }
  async commit() {
    return Promise.resolve();
  }
}

export function checkPathTrust(_opts?: unknown) {
  return { isTrusted: true };
}

export function isHeadlessMode() {
  return false;
}

export function homedir() {
  return os.homedir();
}

export function tmpdir() {
  return os.tmpdir();
}

export function resolveToRealPath(p: string): string {
  try {
    return fs.realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

export async function fetchAdminControlsOnce() {
  return {};
}

export function getCodeAssistServer() {
  return null;
}

export function createPolicyEngineConfig(_settings?: unknown) {
  return {};
}

export function getAllMCPServerStatuses() {
  return {};
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function parseAndFormatApiError(error: unknown): string {
  return getErrorMessage(error);
}

export function safeLiteralReplace(source: string, search: string, replace: string): string {
  return source.replace(search, () => replace);
}

export function isSubagentProgress(_event: unknown): boolean {
  return false;
}

export function processRestorableToolCalls(_calls: unknown[]) {
  return [];
}

export async function performInit(_context: unknown, _args?: unknown) {
  return {
    content: 'GEMINI.md initialized successfully with project guidelines.',
    messageType: 'info' as const,
  };
}

export async function listMemoryFiles(_context: unknown) {
  return [];
}

export async function refreshMemory(_context: unknown) {
  return { success: true };
}

export async function showMemory(_context: unknown) {
  return { content: 'Memory cache active.' };
}

export async function getCheckpointInfoList(_context: unknown) {
  return [];
}

export function getToolCallDataSchema() {
  return {};
}

export async function performRestore(_context: unknown, _checkpoint: string) {
  return { success: true, message: 'Restore completed' };
}

export const startupProfiler = {
  start: () => {},
  stop: () => {},
  measure: () => {},
};

export class Config {
  constructor(public params: Record<string, unknown> = {}) {}
  getTargetDir(): string {
    return typeof this.params?.targetDir === 'string' ? this.params.targetDir : process.cwd();
  }
  getCheckpointingEnabled(): boolean {
    return false;
  }
  storage = {};
  getModel(): string {
    return PREVIEW_GEMINI_MODEL;
  }
  getApiKey(): string {
    return process.env['GEMINI_API_KEY'] || '';
  }
}

export class Scheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  schedule(id: string, fn: () => void, delayMs: number) {
    this.cancel(id);
    const timer = setTimeout(fn, delayMs);
    this.timers.set(id, timer);
  }
  cancel(id: string) {
    const existing = this.timers.get(id);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(id);
    }
  }
}

export class GeminiClient {
  private ai: GoogleGenAI | null = null;
  constructor(private apiKey: string = process.env['GEMINI_API_KEY'] || '') {
    if (this.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    }
  }
  async generateContent(prompt: string, model: string = PREVIEW_GEMINI_MODEL) {
    if (!this.ai) {
      if (process.env['GEMINI_API_KEY']) {
        this.ai = new GoogleGenAI({ apiKey: process.env['GEMINI_API_KEY'] });
      } else {
        throw new FatalAuthenticationError('GEMINI_API_KEY environment variable is missing.');
      }
    }
    const response = await this.ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response;
  }
}

// Export Types
export type MCPServerConfig = Record<string, unknown>;
export type ExtensionInstallMetadata = Record<string, unknown>;
export type GeminiCLIExtension = Record<string, unknown>;
export type PolicySettings = Record<string, unknown>;
export type TelemetryTarget = string;
export type ConfigParameters = Record<string, unknown>;
export type ExtensionLoader = unknown;
export type ToolCallRequestInfo = Record<string, unknown>;
export type AnyDeclarativeTool = Record<string, unknown>;
export type ToolCall = Record<string, unknown>;
export type ToolConfirmationPayload = Record<string, unknown>;
export type CompletedToolCall = Record<string, unknown>;
export type ServerGeminiErrorEvent = { type: string; error: string };
export type ServerGeminiStreamEvent = { type: string; chunk: string };
export type ToolCallConfirmationDetails = Record<string, unknown>;
export type UserTierId = string;
export type ToolLiveOutput = string;
export type AnsiLine = string;
export type AnsiOutput = string;
export type AnsiToken = { text: string };
export type ToolCallsUpdateMessage = Record<string, unknown>;
export type AgentLoopContext = Record<string, unknown>;
