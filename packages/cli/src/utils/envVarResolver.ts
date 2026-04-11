/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolves environment variables in a string.
 * Replaces $VAR_NAME, ${VAR_NAME}, and ${VAR_NAME:-DEFAULT_VALUE} with their corresponding
 * environment variable values. If the environment variable is not defined and no default
 * value is provided, the original placeholder is preserved.
 *
 * @param value - The string that may contain environment variable placeholders
 * @param customEnv - Optional record of environment variables to use before process.env
 * @returns The string with environment variables resolved
 *
 * @example
 * resolveEnvVarsInString("Token: $API_KEY") // Returns "Token: secret-123"
 * resolveEnvVarsInString("URL: ${BASE_URL}/api") // Returns "URL: https://api.example.com/api"
 * resolveEnvVarsInString("URL: ${MISSING_VAR:-https://default.com}") // Returns "URL: https://default.com"
 * resolveEnvVarsInString("Missing: $UNDEFINED_VAR") // Returns "Missing: $UNDEFINED_VAR"
 */
export function resolveEnvVarsInString(
  value: string,
  customEnv?: Record<string, string>,
): string {
  // Regex matches $VAR_NAME, ${VAR_NAME}, and ${VAR_NAME:-DEFAULT_VALUE}
  const envVarRegex = /\$(?:(\w+)|{([^}]+?)(?::-([^}]*))?})/g;

  return value.replace(
    envVarRegex,
    (
      match: string,
      varName1?: string,
      varName2?: string,
      defaultValue?: string,
    ): string => {
      const varName: string = varName1 || varName2 || '';

      if (!varName) {
        return match;
      }

      if (customEnv && typeof customEnv[varName] === 'string') {
        return customEnv[varName];
      }
      if (process && process.env && typeof process.env[varName] === 'string') {
        return process.env[varName];
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      return match;
    },
  );
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
export function resolveEnvVarsInObject<T>(
  obj: T,
  customEnv?: Record<string, string>,
): T {
  return resolveEnvVarsInObjectInternal(obj, new WeakSet(), customEnv);
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
  customEnv?: Record<string, string>,
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return resolveEnvVarsInString(obj, customEnv) as unknown as T;
  }

  if (Array.isArray(obj)) {
    // Check for circular reference
    if (visited.has(obj)) {
      // Return a shallow copy to break the cycle
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return [...obj] as unknown as T;
    }

    visited.add(obj);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const result = obj.map((item) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      resolveEnvVarsInObjectInternal(item, visited, customEnv),
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
        newObj[key] = resolveEnvVarsInObjectInternal(
          newObj[key],
          visited,
          customEnv,
        );
      }
    }
    visited.delete(obj as object);
    return newObj;
  }

  return obj;
}
