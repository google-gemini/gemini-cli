/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Config } from '../config/config.js';
import type { Content, Part } from '@google/genai';
import { LlmRole } from '../telemetry/types.js';
import { debugLogger } from '../utils/debugLogger.js';
import { getResponseText } from '../utils/partUtils.js';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export type FileLevel = 'FULL' | 'PARTIAL' | 'SUMMARY' | 'EXCLUDED';

export interface FileRecord {
  level: FileLevel;
  cachedSummary?: string;
  contentHash?: string;
  startLine?: number;
  endLine?: number;
}

interface CompressionRecord {
  level: FileLevel;
  startLine?: number;
  endLine?: number;
}

interface CompressionRecordJSON {
  level: FileLevel;
  start_line?: number;
  end_line?: number;
}

function hashStringSlice(
  content: string,
  start: number = 0,
  end: number = 12,
): string {
  return crypto
    .createHash('sha256')
    .update(content)
    .digest('hex')
    .slice(start, end);
}

export class ContextCompressionService {
  private config: Config;
  private state: Map<string, FileRecord> = new Map();
  private stateFilePath: string;

  constructor(config: Config) {
    this.config = config;
    const dir = this.config.storage.getProjectTempDir();
    this.stateFilePath = path.join(dir, 'compression_state.json');
  }

  async loadState() {
    try {
      if (existsSync(this.stateFilePath)) {
        const data = await fs.readFile(this.stateFilePath, 'utf-8');
        // Just throw if any invariant fails.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const parsed: Record<string, FileRecord> = JSON.parse(data);
        for (const [k, v] of Object.entries(parsed)) {
          this.state.set(k, v);
        }
      }
    } catch (e) {
      debugLogger.warn(`Failed to load compression state: ${e}`);
    }
  }

  getState(): Record<string, FileRecord> {
    const obj: Record<string, FileRecord> = {};
    for (const [k, v] of this.state.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  setState(stateData: Record<string, FileRecord>) {
    this.state.clear();
    for (const [k, v] of Object.entries(stateData)) {
      this.state.set(k, v);
    }
  }

  async saveState() {
    try {
      const obj: Record<string, FileRecord> = {};
      for (const [k, v] of this.state.entries()) {
        obj[k] = v;
      }
      await fs.writeFile(
        this.stateFilePath,
        JSON.stringify(obj, null, 2),
        'utf-8',
      );
    } catch (e) {
      debugLogger.warn(`Failed to save compression state: ${e}`);
    }
  }

  async compressHistory(
    history: Content[],
    userPrompt: string,
    abortSignal?: AbortSignal,
  ): Promise<Content[]> {
    const enabled = this.config.isContextManagementEnabled();
    if (!enabled) return history;

    const RECENT_TURNS_PROTECTED = 2;
    const cutoff = Math.max(0, history.length - RECENT_TURNS_PROTECTED * 2);

    // Pass 1: Find protected files
    const protectedFiles = new Set<string>();
    for (let i = 0; i < history.length; i++) {
      const turn = history[i];
      if (!turn.parts) continue;

      for (const part of turn.parts) {
        if (
          part.functionCall &&
          (part.functionCall.name === 'read_file' ||
            part.functionCall.name === 'read_many_files')
        ) {
          const args = part.functionCall.args;
          if (args) {
            if (Array.isArray(args['paths'])) {
              if (i >= cutoff) {
                for (const path of args['paths']) {
                  protectedFiles.add(path);
                }
              }
            }
            const filepath = args['filepath'];
            if (filepath && typeof filepath === 'string') {
              // If this read happened within the protected window, it's protected.
              if (i >= cutoff) {
                protectedFiles.add(filepath);
              }
            }
          }
        }
      }
    }

    // Pass 2: Collect files needing routing decisions
    type PendingFile = {
      filepath: string;
      rawContent: string;
      contentToProcess: string;
      lines: string[];
      preview: string;
      lineCount: number;
    };
    const pendingFiles: PendingFile[] = [];
    const pendingFilesSet = new Set<string>(); // deduplicate by filepath

    for (let i = 0; i < history.length; i++) {
      const turn = history[i];
      if (i >= cutoff || turn.role !== 'user' || !turn.parts) continue;

      for (const part of turn.parts) {
        const resp = part.functionResponse;
        if (!resp) continue;
        if (resp.name !== 'read_file' && resp.name !== 'read_many_files')
          continue;

        const output = resp.response?.['output'];
        if (!output || typeof output !== 'string') continue;

        const match = output.match(/--- (.+?) ---\n/);
        let filepath = '';
        if (match) {
          filepath = match[1];
        } else {
          const lines = output.split('\n');
          if (lines[0] && lines[0].includes('---')) {
            filepath = lines[0].replace(/---/g, '').trim();
          }
        }

        if (!filepath || protectedFiles.has(filepath)) continue;

        const hash = hashStringSlice(output);
        const existing = this.state.get(filepath);
        if (
          existing?.level === 'SUMMARY' &&
          existing.cachedSummary &&
          existing.contentHash === hash
        ) {
          continue; // Cache hit — skip routing for this file
        }

        if (pendingFilesSet.has(filepath)) continue; // already queued
        pendingFilesSet.add(filepath);

        let contentToProcess = output;
        if (contentToProcess.startsWith('--- ')) {
          const firstNewline = contentToProcess.indexOf('\n');
          if (firstNewline !== -1) {
            contentToProcess = contentToProcess.substring(firstNewline + 1);
          }
        }
        const lines = contentToProcess.split('\n');

        pendingFiles.push({
          filepath,
          rawContent: output,
          contentToProcess,
          lines,
          preview: lines.slice(0, 30).join('\n'),
          lineCount: lines.length,
        });
      }
    }

    // Pass 3: Single batched routing call for all pending files
    const routingDecisions = await this.batchQueryModel(
      pendingFiles.map((f) => ({
        filepath: f.filepath,
        lineCount: f.lineCount,
        preview: f.preview,
      })),
      userPrompt,
      abortSignal,
    );

    // Update state and save once for all files
    for (const f of pendingFiles) {
      const decision = routingDecisions.get(f.filepath) ?? {
        level: 'FULL' as FileLevel,
      };
      const record = this.state.get(f.filepath) ?? {
        level: 'FULL' as FileLevel,
      };
      const hash = hashStringSlice(f.rawContent);
      if (record.contentHash && record.contentHash !== hash) {
        record.cachedSummary = undefined;
      }
      record.contentHash = hash;
      record.level = decision.level;
      record.startLine = decision.startLine;
      record.endLine = decision.endLine;
      this.state.set(f.filepath, record);
    }
    await this.saveState();

    // Pass 4: Apply decisions — now applyCompressionDecision reads from state, no model calls
    const result: Content[] = [];
    for (let i = 0; i < history.length; i++) {
      const turn = history[i];
      if (i >= cutoff || turn.role !== 'user' || !turn.parts) {
        result.push(turn);
        continue;
      }

      const newParts = await Promise.all(
        turn.parts.map((part: Part) =>
          this.applyCompressionDecision(
            part,
            protectedFiles,
            userPrompt,
            abortSignal,
          ),
        ),
      );
      result.push({ ...turn, parts: newParts });
    }

    // Check for invalid mixed-part turns (functionResponse combined with text parts).
    for (let i = 0; i < result.length; i++) {
      const turn = result[i];
      if (turn.role !== 'user' || !turn.parts) continue;
      const hasFunctionResponse = turn.parts.some((p) => !!p.functionResponse);
      const hasNonFunctionResponse = turn.parts.some(
        (p) => !p.functionResponse,
      );
      if (hasFunctionResponse && hasNonFunctionResponse) {
        debugLogger.warn(
          'Compression produced a mixed-part turn. Restoring original turn.',
        );
        result[i] = history[i];
      }
    }

    // Validate structural integrity: every functionCall MUST be followed by a functionResponse in the next turn.
    for (let i = 0; i < result.length; i++) {
      const turn = result[i];
      if (turn.parts) {
        for (const part of turn.parts) {
          if (part.functionCall) {
            // Check the very next turn
            const nextTurn = result[i + 1];

            // If the functionCall is the final element of the existing payload,
            // the functionResponse is implicitly represented by the current incoming turn in client.ts
            if (!nextTurn) {
              continue;
            }

            if (nextTurn.role !== 'user' || !nextTurn.parts) {
              debugLogger.warn(
                'Compression broke functionCall/functionResponse adjacency invariant. Falling back to uncompressed history.',
              );
              return history;
            }
            const hasMatchingResponse = nextTurn.parts.some(
              (p) =>
                p.functionResponse &&
                p.functionResponse.name === part.functionCall!.name,
            );
            if (!hasMatchingResponse) {
              debugLogger.warn(
                'Compression broke functionCall/functionResponse adjacency invariant. Falling back to uncompressed history.',
              );
              return history;
            }
          }
        }
      }
    }

    return result;
  }

  private async applyCompressionDecision(
    part: Part,
    protectedFiles: Set<string>,
    userPrompt: string,
    abortSignal?: AbortSignal,
  ): Promise<Part> {
    const resp = part.functionResponse;
    if (!resp) return part;
    if (resp.name !== 'read_file' && resp.name !== 'read_many_files')
      return part;

    const output = resp.response?.['output'];
    if (!output || typeof output !== 'string') return part;

    const match = output.match(/--- (.+?) ---\n/);
    let filepath = '';
    if (match) {
      filepath = match[1];
    } else {
      const lines = output.split('\n');
      if (lines[0] && lines[0].includes('---')) {
        filepath = lines[0].replace(/---/g, '').trim();
      } else {
        return part;
      }
    }

    if (protectedFiles.has(filepath)) return part;

    const record = this.state.get(filepath);
    if (!record || record.level === 'FULL') return part;

    let contentToProcess = output;
    if (contentToProcess.startsWith('--- ')) {
      const firstNewline = contentToProcess.indexOf('\n');
      if (firstNewline !== -1) {
        contentToProcess = contentToProcess.substring(firstNewline + 1);
      }
    }
    const lines = contentToProcess.split('\n');

    let compressed: string;

    if (record.level === 'PARTIAL' && record.startLine && record.endLine) {
      const start = Math.max(0, record.startLine - 1);
      const end = Math.min(lines.length, record.endLine);
      const snippet = lines
        .slice(start, end)
        .map((l, i) => `${start + i + 1} | ${l}`)
        .join('\n');
      compressed =
        `[Showing lines ${record.startLine}–${record.endLine} of ${lines.length} ` +
        `in ${path.basename(filepath)}. Full file available via read_file.]\n\n${snippet}`;
    } else if (record.level === 'SUMMARY') {
      if (!record.cachedSummary) {
        record.cachedSummary = await this.generateSummary(
          filepath,
          contentToProcess,
          abortSignal,
        );
        this.state.set(filepath, record);
        await this.saveState();
      }
      compressed =
        `[Summary of ${path.basename(filepath)} (${lines.length} lines). ` +
        `Full file available via read_file.]\n\n${record.cachedSummary}`;
    } else if (record.level === 'EXCLUDED') {
      compressed =
        `[${path.basename(filepath)} omitted as not relevant to current query. ` +
        `Request via read_file if needed.]`;
    } else {
      return part;
    }

    if (compressed === output) return part;

    return {
      functionResponse: {
        // `FunctionResponse` should be safe to spread
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        ...resp,
        response: { ...resp.response, output: compressed },
      },
    };
  }

  getFileState(filepath: string): FileRecord | undefined {
    return this.state.get(filepath);
  }

  private async batchQueryModel(
    files: Array<{ filepath: string; lineCount: number; preview: string }>,
    userPrompt: string,
    abortSignal?: AbortSignal,
  ): Promise<Map<string, CompressionRecord>> {
    const results = new Map<string, CompressionRecord>();

    // Default all to FULL so any failure is safe
    for (const f of files) {
      results.set(f.filepath, { level: 'FULL' });
    }

    if (files.length === 0) return results;

    const systemPrompt = `You are a context routing agent for a coding AI session.
For each file listed, decide what level of content to send to the main model.
Levels: FULL, PARTIAL (with line range), SUMMARY, EXCLUDED.
Rules:
- FULL if the file is directly relevant to the query or small (<80 lines)
- PARTIAL if only a specific section is needed — provide start_line and end_line
- SUMMARY for background context files not directly needed
- EXCLUDED for completely unrelated files
Respond ONLY with a JSON object where each key is the filepath and the value is:
{"level":"FULL"|"PARTIAL"|"SUMMARY"|"EXCLUDED","start_line":null,"end_line":null}`;

    const fileList = files
      .map(
        (f) =>
          `File: ${f.filepath} (${f.lineCount} lines)\nPreview:\n${f.preview}`,
      )
      .join('\n\n---\n\n');

    const userMessage = `Query: "${userPrompt}"\n\n${fileList}`;

    const client = this.config.getBaseLlmClient();
    try {
      // Build per-file schema properties dynamically
      const properties: Record<string, object> = {};
      for (const f of files) {
        properties[f.filepath] = {
          type: 'OBJECT',
          properties: {
            level: { type: 'STRING' },
            start_line: { type: 'INTEGER' },
            end_line: { type: 'INTEGER' },
          },
          required: ['level'],
        };
      }

      const responseJson = await client.generateJson({
        modelConfigKey: { model: 'chat-compression-2.5-flash-lite' },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        systemInstruction: systemPrompt,
        schema: { properties, required: files.map((f) => f.filepath) },
        promptId: 'context-compression-batch-query',
        role: LlmRole.UTILITY_COMPRESSOR,
        abortSignal: abortSignal ?? new AbortController().signal,
      });

      for (const f of files) {
        // Just throw if JSON parsing fails.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const decision = responseJson[f.filepath] as
          | CompressionRecordJSON
          | undefined;
        if (typeof decision !== 'object') continue;
        if (typeof decision === 'object' && decision && decision.level) {
          results.set(f.filepath, {
            level: decision.level ?? 'FULL',
            startLine: decision.start_line ?? undefined,
            endLine: decision.end_line ?? undefined,
          });
        }
      }
    } catch (e) {
      debugLogger.warn(
        `Batch cloud routing failed: ${e}. Defaulting all to FULL.`,
      );
    }
    return results;
  }

  private async generateSummary(
    filepath: string,
    content: string,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const promptMessage = `Summarize this file in 2-3 sentences. Be technical and specific about what it exports, its key functions, and dependencies. File: ${filepath}\n\n${content.slice(0, 4000)}`;
    const client = this.config.getBaseLlmClient();
    try {
      const response = await client.generateContent({
        modelConfigKey: { model: 'chat-compression-2.5-flash-lite' },
        contents: [{ role: 'user', parts: [{ text: promptMessage }] }],
        promptId: 'local-context-compression-summary',
        role: LlmRole.UTILITY_COMPRESSOR,
        abortSignal: abortSignal ?? new AbortController().signal,
      });
      const text = getResponseText(response) ?? '';
      return text.trim();
    } catch (e) {
      return `[Summary generation failed for ${filepath} (cloud error): ${e}]`;
    }
  }
}
