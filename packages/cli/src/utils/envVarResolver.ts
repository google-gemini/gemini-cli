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
    return obj.map((item) => resolveEnvVarsInObject(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const newObj = { ...obj } as T;
    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) {
        newObj[key] = resolveEnvVarsInObject(newObj[key]);
      }
    }
    return newObj;
  }

  return obj;
}
