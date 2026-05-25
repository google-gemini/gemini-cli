/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { parse, stringify } from 'comment-json';
import { coreEvents } from '@google/gemini-cli-core';
import { isLikelyShellCommand } from './shellCommandValidator.js';

/**
 * Type representing an object that may contain Symbol keys for comments.
 */
type CommentedRecord = Record<string | symbol, unknown>;

/** Keys that can cause prototype pollution if merged into settings. */
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Recursively strips prototype-pollution keys from a nested object
 * to prevent untrusted updates from polluting Object.prototype.
 */
function stripPrototypeKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripPrototypeKeys) as unknown as T;
  }
  if (typeof value === 'object' && value !== null) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!PROTOTYPE_POLLUTION_KEYS.has(k)) {
        clean[k] = stripPrototypeKeys(v);
      }
    }
    return clean as unknown as T;
  }
  return value;
}

/**
 * Strips characters from a command string that could enable injection
 * (e.g., newlines that break command boundaries).
 */
function sanitizeCommandValue(command: string): string {
  return command.replace(/[\n\r]/g, ' ');
}

  /**
   * Recursively walks the updates object and warns about any object with
   * `type: "command"` or `type: "stdio"` whose `command` value looks like
   * natural language rather than a valid shell command.
   * Also sanitizes command values to strip injection vectors.
   */
function warnAboutNaturalLanguageCommandValues(
  updates: Record<string, unknown>,
  path: string,
): void {
  for (const [key, value] of Object.entries(updates)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const objValue = value as Record<string, unknown>;
      if (
        (objValue['type'] === 'command' || objValue['type'] === 'stdio') &&
        typeof objValue['command'] === 'string'
      ) {
        objValue['command'] = sanitizeCommandValue(objValue['command']);
        if (!isLikelyShellCommand(objValue['command'])) {
          coreEvents.emitFeedback(
            'warn',
            `Setting "${currentPath}.command" contains text that does not look like a valid shell command. ` +
              'The value will be saved, but it may fail when executed.',
          );
        }
      }
      warnAboutNaturalLanguageCommandValues(objValue, currentPath);
    } else if (Array.isArray(value)) {
      (value as unknown[]).forEach((item, index) => {
        if (
          typeof item === 'object' &&
          item !== null &&
          !Array.isArray(item)
        ) {
          warnAboutNaturalLanguageCommandValues(
            item as Record<string, unknown>,
            `${currentPath}[${index}]`,
          );
        }
      });
    }
  }
}

/**
 * Updates a JSON file while preserving comments and formatting.
 */
export function updateSettingsFilePreservingFormat(
  filePath: string,
  updates: Record<string, unknown>,
): void {
  // Sanitize untrusted input before any processing
  const sanitizedUpdates = stripPrototypeKeys(updates);
  warnAboutNaturalLanguageCommandValues(sanitizedUpdates, '');

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(sanitizedUpdates, null, 2), 'utf-8');
    return;
  }

  const originalContent = fs.readFileSync(filePath, 'utf-8');

  let parsed: Record<string, unknown>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    parsed = parse(originalContent) as Record<string, unknown>;
  } catch (error) {
    coreEvents.emitFeedback(
      'error',
      'Error parsing settings file. Please check the JSON syntax.',
      error,
    );
    return;
  }

  const updatedStructure = applyUpdates(parsed, sanitizedUpdates);
  const updatedContent = stringify(updatedStructure, null, 2);

  fs.writeFileSync(filePath, updatedContent, 'utf-8');
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
    if (!Object.prototype.hasOwnProperty.call(desired, existingKey)) {
      preserveCommentsOnPropertyDeletion(base, existingKey);
      delete base[existingKey];
    }
  }

  for (const nextKey of Object.getOwnPropertyNames(desired)) {
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
