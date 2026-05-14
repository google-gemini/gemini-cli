/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Type guard: narrows `obj` to an object with a property `prop` of unknown type.
 */
export function hasProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: unknown } {
  return obj !== null && typeof obj === 'object' && prop in obj;
}

/**
 * Type guard: narrows `obj` to an object with a property `prop` of type `string`.
 */
export function isStringProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: string } {
  return hasProperty(obj, prop) && typeof obj[prop] === 'string';
}

/**
 * Type guard: narrows `obj` to an object with a property `prop` whose value is
 * a non-null object.
 */
export function isObjectProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: object } {
  return (
    hasProperty(obj, prop) &&
    obj[prop] !== null &&
    typeof obj[prop] === 'object'
  );
}
