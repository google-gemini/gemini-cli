/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MergeStrategy } from '../config/settingsSchema.js';

export type Mergeable =
  | string
  | number
  | boolean
  | null
  | undefined
  | object
  | Mergeable[];

export type MergeableObject = Record<string, Mergeable>;

function isPlainObject(item: unknown): item is MergeableObject {
  return !!item && typeof item === 'object' && !Array.isArray(item);
}

function mergeRecursively(
  target: MergeableObject,
  source: MergeableObject,
  getMergeStrategyForPath: (path: string[]) => MergeStrategy | undefined,
  path: string[] = [],
  clones: Map<object, MergeableObject> = new Map(),
) {
  // Track the chain of source objects currently being merged, mapping each to
  // the clone being built for it. A circular reference (a source object that
  // points back to one of its own ancestors) is resolved to that ancestor's
  // clone instead of being recursed into, which would otherwise overflow the
  // stack — and keeps the merged result a fully independent clone rather than
  // embedding a reference to the original source. Entries are scoped to the
  // current recursion branch (added on entry, removed on exit), so shared but
  // non-circular references are still merged normally.
  clones.set(source, target);
  for (const key of Object.keys(source)) {
    // JSON.parse can create objects with __proto__ as an own property.
    // We must skip it to prevent prototype pollution.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const srcValue = source[key];
    if (srcValue === undefined) {
      continue;
    }
    const newPath = [...path, key];
    const objValue = target[key];
    const mergeStrategy = getMergeStrategyForPath(newPath);

    if (mergeStrategy === MergeStrategy.SHALLOW_MERGE && objValue && srcValue) {
      const obj1 =
        typeof objValue === 'object' && objValue !== null ? objValue : {};
      const obj2 =
        typeof srcValue === 'object' && srcValue !== null ? srcValue : {};
      target[key] = { ...obj1, ...obj2 };
      continue;
    }

    if (Array.isArray(objValue)) {
      const srcArray = Array.isArray(srcValue) ? srcValue : [srcValue];
      if (mergeStrategy === MergeStrategy.CONCAT) {
        target[key] = objValue.concat(srcArray);
        continue;
      }
      if (mergeStrategy === MergeStrategy.UNION) {
        target[key] = [...new Set(objValue.concat(srcArray))];
        continue;
      }
    }

    const ancestorClone = isPlainObject(srcValue)
      ? clones.get(srcValue)
      : undefined;
    if (ancestorClone !== undefined) {
      // Circular reference back to an ancestor source object: assign that
      // ancestor's clone so the cycle is reproduced inside the new structure,
      // instead of recursing forever or leaking a reference to the source.
      target[key] = ancestorClone;
      continue;
    }

    if (isPlainObject(objValue) && isPlainObject(srcValue)) {
      mergeRecursively(
        objValue,
        srcValue,
        getMergeStrategyForPath,
        newPath,
        clones,
      );
    } else if (isPlainObject(srcValue)) {
      target[key] = {};
      mergeRecursively(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        target[key] as MergeableObject,
        srcValue,
        getMergeStrategyForPath,
        newPath,
        clones,
      );
    } else {
      target[key] = srcValue;
    }
  }
  clones.delete(source);
  return target;
}

export function customDeepMerge(
  getMergeStrategyForPath: (path: string[]) => MergeStrategy | undefined,
  ...sources: MergeableObject[]
): MergeableObject {
  const result: MergeableObject = {};

  for (const source of sources) {
    if (source) {
      mergeRecursively(result, source, getMergeStrategyForPath);
    }
  }

  return result;
}
