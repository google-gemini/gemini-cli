/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { SecretMatch, SecretScanResult } from './secret-scanner.js';

const HF_MODEL_ID = 'onnx-community/gliner_multi_pii-v1';
const HF_MODEL_URL = `https://huggingface.co/${HF_MODEL_ID}/resolve/main/onnx/model.onnx`;
const MODEL_FILENAME = 'model.onnx';
const INFERENCE_THRESHOLD = 0.4;

const PII_LABELS = [
  'api key',
  'password',
  'token',
  'secret',
  'name',
  'email address',
  'phone number',
  'ssn',
  'credit card number',
  'date of birth',
  'ip address',
  'address',
];

interface GlinerInstance {
  initialize(): Promise<void>;
  inference(opts: {
    texts: string[];
    entities: string[];
    threshold?: number;
    flatNer?: boolean;
    multiLabel?: boolean;
  }): Promise<NerEntity[][]>;
}

interface NerEntity {
  entity: string;
  value: string;
  score: number;
  start: number;
  end: number;
}

export function getModelCacheDir(): string {
  return path.join(os.homedir(), '.gemini', 'models', 'gliner-pii');
}

async function downloadModel(
  modelPath: string,
  onProgress?: (msg: string) => void,
): Promise<void> {
  await fs.mkdir(path.dirname(modelPath), { recursive: true });
  onProgress?.(`Downloading GLiNER-PII model (~197 MB) to ${modelPath} — one-time setup…`);
  const response = await fetch(HF_MODEL_URL);
  if (!response.ok || !response.body) {
    throw new Error(
      `GLiNER model download failed: ${response.status} ${response.statusText}`,
    );
  }
  const tmp = modelPath + '.tmp';
  const dest = createWriteStream(tmp);
  await streamPipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    dest,
  );
  await fs.rename(tmp, modelPath);
  onProgress?.('GLiNER-PII model ready.');
}

let _instance: GlinerInstance | null = null;
let _initPromise: Promise<GlinerInstance | null> | null = null;

export async function initNerScanner(
  onProgress?: (msg: string) => void,
): Promise<GlinerInstance | null> {
  if (_instance) return _instance;
  if (_initPromise) return _initPromise;
  _initPromise = (async (): Promise<GlinerInstance | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Gliner: new (opts: unknown) => GlinerInstance;
    try {
      // Dynamic import so the `gliner` package remains optional.
      // Indirect variable prevents TS from resolving 'gliner' as a module at compile time.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pkg = 'gliner';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ Gliner } = (await import(pkg)) as any);
    } catch {
      return null;
    }
    const modelPath = path.join(getModelCacheDir(), MODEL_FILENAME);
    try {
      await fs.access(modelPath);
    } catch {
      await downloadModel(modelPath, onProgress);
    }
    const gliner = new Gliner({
      tokenizerPath: HF_MODEL_ID,
      onnxSettings: {
        modelPath,
        executionProvider: 'cpu',
        multiThread: true,
      },
    });
    await gliner.initialize();
    _instance = gliner;
    return _instance;
  })();
  return _initPromise;
}

/** Resets the cached instance — used in tests. */
export function _resetNerScanner(): void {
  _instance = null;
  _initPromise = null;
}

/** Injects a mock instance — used in tests to bypass model loading. */
export function _setNerScannerInstance(mock: GlinerInstance | null): void {
  _instance = mock;
  _initPromise = null;
}

/**
 * Scans text for PII entities using a local GLiNER-PII ONNX model and redacts
 * detected values. Falls back to `{ matches: [], sanitized: content }` if the
 * `gliner` package is not installed or the model is unavailable.
 */
export async function nerScanAndRedact(
  content: string,
  onProgress?: (msg: string) => void,
): Promise<SecretScanResult> {
  const scanner = await initNerScanner(onProgress);
  if (!scanner) return { matches: [], sanitized: content };

  const results = await scanner.inference({
    texts: [content],
    entities: PII_LABELS,
    threshold: INFERENCE_THRESHOLD,
    flatNer: true,
    multiLabel: false,
  });

  const entities: NerEntity[] = results[0] ?? [];
  if (entities.length === 0) return { matches: [], sanitized: content };

  // Sort descending by start so slice replacements don't shift later indices
  const sorted = [...entities].sort((a, b) => b.start - a.start);
  const matches: SecretMatch[] = [];
  let sanitized = content;

  for (const entity of sorted) {
    const typeKey = `ner_${entity.entity.replace(/\s+/g, '_')}`;
    const placeholder = `[REDACTED:${typeKey}]`;
    matches.push({ type: typeKey, value: entity.value, redacted: placeholder });
    sanitized =
      sanitized.slice(0, entity.start) + placeholder + sanitized.slice(entity.end);
  }

  return { matches, sanitized };
}
