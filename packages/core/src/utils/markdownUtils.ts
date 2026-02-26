/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts a camelCase string to a Space Case string.
 * e.g., "camelCaseString" -> "Camel Case String"
 */
function camelToSpace(text: string): string {
  const result = text.replace(/([A-Z])/g, ' $1');
  return result.charAt(0).toUpperCase() + result.slice(1).trim();
}

/**
 * Converts a JSON-compatible value into a readable Markdown representation.
 *
 * @param data The data to convert.
 * @param indent The current indentation level (for internal recursion).
 * @returns A Markdown string representing the data.
 */
export function jsonToMarkdown(data: unknown, indent = 0): string {
  const spacing = '  '.repeat(indent);

  if (data === null) {
    return 'null';
  }

  if (data === undefined) {
    return 'undefined';
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return '[]';
    }

    if (isArrayOfSimilarObjects(data)) {
      return renderTable(data, indent);
    }

    return data
      .map((item) => {
        if (
          typeof item === 'object' &&
          item !== null &&
          Object.keys(item).length > 0
        ) {
          const rendered = jsonToMarkdown(item, indent + 1);
          return `${spacing}-\n${rendered}`;
        }
        const rendered = jsonToMarkdown(item, indent + 1).trimStart();
        return `${spacing}- ${rendered}`;
      })
      .join('\n');
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data);
    if (entries.length === 0) {
      return '{}';
    }

    return entries
      .map(([key, value]) => {
        const displayKey = camelToSpace(key);
        if (
          typeof value === 'object' &&
          value !== null &&
          Object.keys(value).length > 0
        ) {
          const renderedValue = jsonToMarkdown(value, indent + 1);
          return `${spacing}- **${displayKey}**:\n${renderedValue}`;
        }
        const renderedValue = jsonToMarkdown(value, indent + 1).trimStart();
        return `${spacing}- **${displayKey}**: ${renderedValue}`;
      })
      .join('\n');
  }

  if (typeof data === 'string') {
    return data
      .split('\n')
      .map((line, i) => (i === 0 ? line : spacing + line))
      .join('\n');
  }

  return String(data);
}

/**
 * Safely attempts to parse a string as JSON and convert it to Markdown.
 * If parsing fails, returns the original string.
 *
 * @param text The text to potentially convert.
 * @returns The Markdown representation or the original text.
 */
export function safeJsonToMarkdown(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    return jsonToMarkdown(parsed);
  } catch {
    return text;
  }
}

function isArrayOfSimilarObjects(
  data: unknown[],
): data is Array<Record<string, unknown>> {
  if (data.length === 0) {
    return false;
  }
  if (
    !data.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) &&
        Object.keys(item).length > 0,
    )
  ) {
    return false;
  }

  // These casts are not unsafe, due to the `typeof` check above.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const firstKeys = Object.keys(data[0] as object)
    .sort()
    .join(',');
  return data.every(
    (item) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      Object.keys(item as object)
        .sort()
        .join(',') === firstKeys,
  );
}

function renderTable(data: Array<Record<string, unknown>>, indent = 0): string {
  const spacing = '  '.repeat(indent);
  const keys = Object.keys(data[0]);
  const displayKeys = keys.map(camelToSpace);
  const header = `${spacing}| ${displayKeys.join(' | ')} |`;
  const separator = `${spacing}| ${keys.map(() => '---').join(' | ')} |`;
  const rows = data.map(
    (item) =>
      `${spacing}| ${keys
        .map((key) => {
          const val = item[key];
          if (typeof val === 'object' && val !== null) {
            return JSON.stringify(val)
              .replace(/\\/g, '\\\\')
              .replace(/\|/g, '\\|');
          }
          return String(val)
            .replace(/\\/g, '\\\\')
            .replace(/\|/g, '\\|')
            .replace(/\n/g, ' ');
        })
        .join(' | ')} |`,
  );
  return [header, separator, ...rows].join('\n');
}
