/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolves environment variables in a string.
 * Replaces $VAR_NAME and ${VAR_NAME} with their corresponding environment variable values.
 * If the environment variable is not defined, the original placeholder is preserved.
 *
 * @param value - The string that may contain environment variable placeholders
 * @returns The string with environment variables resolved
 *
 * @example
 * resolveEnvVarsInString("Token: $API_KEY") // Returns "Token: secret-123"
 * resolveEnvVarsInString("URL: ${BASE_URL}/api") // Returns "URL: https://api.example.com/api"
 * resolveEnvVarsInString("Missing: $UNDEFINED_VAR") // Returns "Missing: $UNDEFINED_VAR"
 */
export function resolveEnvVarsInString(value: string): string {
  const envVarRegex = /\$(?:(\w+)|{([^}]+)})/g; // Find $VAR_NAME or ${VAR_NAME}
  return value.replace(envVarRegex, (match, varName1, varName2) => {
    const varName = varName1 || varName2;
    if (process && process.env && typeof process.env[varName] === 'string') {
      return process.env[varName]!;
    }
    return match;
  });
}

/**
 * Recursively resolves environment variables in an object of any type.
 * Handles strings, arrays, nested objects, and preserves other primitive types.
 * Protected against circular references using a WeakSet to track visited objects.
 *
 * @param obj - The object to process for environment variable resolution
 * @returns A new object with environment variables resolved
 *
 * @example
 * const config = {
 *   server: {
 *     host: "$HOST",
 *     port: "${PORT}",
 *     enabled: true,
 *     tags: ["$ENV", "api"]
 *   }
 * };
 * const resolved = resolveEnvVarsInObject(config);
 */
export function resolveEnvVarsInObject<T>(obj: T): T {
  return resolveEnvVarsInObjectInternal(obj, new WeakSet());
}

/**
 * Internal implementation of resolveEnvVarsInObject with circular reference protection.
 *
 * @param obj - The object to process
 * @param visited - WeakSet to track visited objects and prevent circular references
 * @returns A new object with environment variables resolved
 */
function resolveEnvVarsInObjectInternal<T>(
  obj: T,
  visited: WeakSet<object>,
): T {
  if (
    obj === null ||
    obj === undefined ||
    typeof obj === 'boolean' ||
    typeof obj === 'number'
  ) {
    return obj;
  }

  if (typeof obj === 'string') {
    return resolveEnvVarsInString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    // Check for circular reference
    if (visited.has(obj)) {
      // Return a shallow copy to break the cycle
      return [...obj] as unknown as T;
    }

    visited.add(obj);
    const result = obj.map((item) =>
      resolveEnvVarsInObjectInternal(item, visited),
    ) as unknown as T;
    visited.delete(obj);
    return result;
  }

  if (typeof obj === 'object') {
    // Check for circular reference
    if (visited.has(obj as object)) {
      // Return a shallow copy to break the cycle
      return { ...obj } as T;
    }

    visited.add(obj as object);
    const newObj = { ...obj } as T;
    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) {
        newObj[key] = resolveEnvVarsInObjectInternal(newObj[key], visited);
      }
    }
    visited.delete(obj as object);
    return newObj;
  }

  return obj;
}
