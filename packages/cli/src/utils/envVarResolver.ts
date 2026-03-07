/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolves environment variables in a string.
 * Replaces $VAR_NAME, ${VAR_NAME}, and ${VAR_NAME:-default} with their
 * corresponding environment variable values. If the environment variable is not
 * defined and no default value is provided, the original placeholder is preserved.
 *
 * Supported syntax:
 * - `$VAR_NAME` — simple variable reference
 * - `${VAR_NAME}` — braced variable reference
 * - `${VAR_NAME:-default}` — variable with a default value used when the
 *   variable is unset or empty
 * - `${VAR_NAME-default}` — variable with a default value used when the
 *   variable is unset (empty string is kept)
 *
 * @param value - The string that may contain environment variable placeholders
 * @returns The string with environment variables resolved
 *
 * @example
 * resolveEnvVarsInString("Token: $API_KEY") // Returns "Token: secret-123"
 * resolveEnvVarsInString("URL: ${BASE_URL}/api") // Returns "URL: https://api.example.com/api"
 * resolveEnvVarsInString("Missing: $UNDEFINED_VAR") // Returns "Missing: $UNDEFINED_VAR"
 * resolveEnvVarsInString("${UNSET:-fallback}") // Returns "fallback"
 */
export function resolveEnvVarsInString(
  value: string,
  customEnv?: Record<string, string>,
): string {
  // Matches:
  //  1) $WORD          — captured in group 1
  //  2) ${...}         — the content inside braces is captured in group 2
  const envVarRegex = /\$(?:(\w+)|{([^}]+)})/g;
  return value.replace(envVarRegex, (match, varName1, bracedContent) => {
    // Simple $VAR form — no default value syntax possible
    if (varName1) {
      if (customEnv && typeof customEnv[varName1] === 'string') {
        return customEnv[varName1];
      }
      if (process && process.env && typeof process.env[varName1] === 'string') {
        return process.env[varName1];
      }
      return match;
    }

    // Braced ${...} form — may include a default value
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const braced: string = bracedContent;

    // Parse ${VAR:-default} and ${VAR-default} syntax
    // :-  means "use default if unset OR empty"
    // -   means "use default if unset" (empty string is kept)
    const colonDashIdx = braced.indexOf(':-');
    const dashIdx = braced.indexOf('-');

    let varName: string;
    let defaultValue: string | undefined;
    let useDefaultWhenEmpty = false;

    if (colonDashIdx !== -1) {
      // ${VAR:-default}
      varName = braced.substring(0, colonDashIdx);
      defaultValue = braced.substring(colonDashIdx + 2);
      useDefaultWhenEmpty = true;
    } else if (dashIdx !== -1) {
      // ${VAR-default}
      varName = braced.substring(0, dashIdx);
      defaultValue = braced.substring(dashIdx + 1);
      useDefaultWhenEmpty = false;
    } else {
      // ${VAR} — no default
      varName = braced;
      defaultValue = undefined;
    }

    // Look up the variable value
    let resolved: string | undefined;
    if (customEnv && typeof customEnv[varName] === 'string') {
      resolved = customEnv[varName];
    } else if (
      process &&
      process.env &&
      typeof process.env[varName] === 'string'
    ) {
      resolved = process.env[varName];
    }

    // Apply default-value logic
    if (resolved === undefined) {
      // Variable is unset
      return defaultValue !== undefined ? defaultValue : match;
    }

    if (useDefaultWhenEmpty && resolved === '' && defaultValue !== undefined) {
      // Variable is set but empty and :- syntax was used
      return defaultValue;
    }

    return resolved;
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
