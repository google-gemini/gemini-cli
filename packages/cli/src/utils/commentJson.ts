/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse, stringify } from 'comment-json';
import { coreEvents } from '@google/gemini-cli-core';

/**
 * Type representing an object that may contain Symbol keys for comments.
 */
type CommentedRecord = Record<string | symbol, unknown>;

function isDangerousKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

let tempCounter = 0;

function readFileWithRetry(filePath: string, retries = 3): string {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        err.code === 'ENOENT'
      ) {
        throw err;
      }
      attempt++;
      if (attempt >= retries) {
        throw err;
      }
      // Node.js main thread disallows Atomics.wait; use synchronous busy-wait for short delays
      const end = Date.now() + 25 * attempt;
      while (Date.now() < end) {
        /* empty */
      }
    }
  }
  return '';
}

function writeAtomicSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${tempCounter++}.tmp`,
  );
  try {
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // ignore
    }
    // Fallback to direct write if rename fails
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

/**
 * Updates a JSON file while preserving comments and formatting.
 */
export function updateSettingsFilePreservingFormat(
  filePath: string,
  updates: Record<string, unknown>,
): void {
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    writeAtomicSync(filePath, JSON.stringify(updates, null, 2));
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    const originalContent = readFileWithRetry(filePath);
    if (!originalContent.trim()) {
      parsed = {};
    } else {
      const rawParsed: unknown = parse(originalContent);
      if (
        typeof rawParsed !== 'object' ||
        rawParsed === null ||
        Array.isArray(rawParsed)
      ) {
        parsed = {};
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        parsed = rawParsed as Record<string, unknown>;
      }
    }
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      writeAtomicSync(filePath, JSON.stringify(updates, null, 2));
      return;
    }
    coreEvents.emitFeedback(
      'error',
      'Error parsing settings file. Please check the JSON syntax.',
      error,
    );
    return;
  }

  const updatedStructure = applyUpdates(parsed, updates);
  const updatedContent = stringify(updatedStructure, null, 2);

  writeAtomicSync(filePath, updatedContent);
}

/**
 * When deleting a property from a comment-json parsed object, relocate any
 * leading/trailing comments that were attached to that property so they are not lost.
 *
 * This function re-attaches comments to the next sibling's leading comments if
 * available, otherwise to the previous sibling's trailing comments, otherwise
 * to the container's leading/trailing comments.
 */
function preserveCommentsOnPropertyDeletion(
  container: Record<string, unknown>,
  propName: string,
): void {
  if (isDangerousKey(propName)) {
    return;
  }
  const target = container as CommentedRecord;
  const beforeSym = Symbol.for(`before:${propName}`);
  const afterSym = Symbol.for(`after:${propName}`);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const beforeComments = target[beforeSym] as unknown[] | undefined;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const afterComments = target[afterSym] as unknown[] | undefined;

  if (!beforeComments && !afterComments) return;

  const keys = Object.getOwnPropertyNames(container);
  const idx = keys.indexOf(propName);
  const nextKey = idx >= 0 && idx + 1 < keys.length ? keys[idx + 1] : undefined;
  const prevKey = idx > 0 ? keys[idx - 1] : undefined;

  function appendToSymbol(destSym: symbol, comments: unknown[]) {
    if (!comments || comments.length === 0) return;
    const existing = target[destSym];
    target[destSym] = Array.isArray(existing)
      ? existing.concat(comments)
      : comments;
  }

  if (beforeComments && beforeComments.length > 0) {
    if (nextKey) {
      appendToSymbol(Symbol.for(`before:${nextKey}`), beforeComments);
    } else if (prevKey) {
      appendToSymbol(Symbol.for(`after:${prevKey}`), beforeComments);
    } else {
      appendToSymbol(Symbol.for('before'), beforeComments);
    }
    delete target[beforeSym];
  }

  if (afterComments && afterComments.length > 0) {
    if (nextKey) {
      appendToSymbol(Symbol.for(`before:${nextKey}`), afterComments);
    } else if (prevKey) {
      appendToSymbol(Symbol.for(`after:${prevKey}`), afterComments);
    } else {
      appendToSymbol(Symbol.for('after'), afterComments);
    }
    delete target[afterSym];
  }
}

/**
 * Applies sync-by-omission semantics: synchronizes base to match desired.
 * - Adds/updates keys from desired
 * - Removes keys from base that are not in desired
 * - Recursively applies to nested objects
 * - Preserves comments when deleting keys
 */
function applyKeyDiff(
  base: Record<string, unknown>,
  desired: Record<string, unknown>,
): void {
  for (const existingKey of Object.getOwnPropertyNames(base)) {
    if (isDangerousKey(existingKey)) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(desired, existingKey)) {
      preserveCommentsOnPropertyDeletion(base, existingKey);
      delete base[existingKey];
    }
  }

  for (const nextKey of Object.getOwnPropertyNames(desired)) {
    if (isDangerousKey(nextKey)) {
      continue;
    }
    const nextVal = desired[nextKey];
    const baseVal = base[nextKey];

    const isObj =
      typeof nextVal === 'object' &&
      nextVal !== null &&
      !Array.isArray(nextVal);
    const isBaseObj =
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal);
    const isArr = Array.isArray(nextVal);
    const isBaseArr = Array.isArray(baseVal);

    if (isObj && isBaseObj) {
      applyKeyDiff(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        baseVal as Record<string, unknown>,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        nextVal as Record<string, unknown>,
      );
    } else if (isArr && isBaseArr) {
      // In-place mutate arrays to preserve array-level comments on CommentArray
      const baseArr = baseVal as unknown[];
      const desiredArr = nextVal as unknown[];
      baseArr.length = 0;
      for (const el of desiredArr) {
        baseArr.push(el);
      }
    } else {
      base[nextKey] = nextVal;
    }
  }
}

function applyUpdates(
  current: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  // Apply sync-by-omission semantics consistently at all levels
  applyKeyDiff(current, updates);
  return current;
}
