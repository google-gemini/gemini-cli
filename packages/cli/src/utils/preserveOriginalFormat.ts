/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import stripJsonComments from 'strip-json-comments';

interface EnvVarMapping {
  path: string[];
  originalValue: string;
  resolvedValue: unknown;
}

/**
 * Updates a JSON file while preserving:
 * - Comments (both line and block comments)
 * - Environment variable references ($VAR_NAME or ${VAR_NAME})
 * - Original formatting and whitespace
 * 
 * Only updates the specific fields that have changed.
 */
export function updateSettingsFilePreservingFormat(
  filePath: string,
  updates: Record<string, unknown>,
  envVarMappings: EnvVarMapping[] = [],
): void {
  if (!fs.existsSync(filePath)) {
    // If file doesn't exist, create it with standard formatting
    fs.writeFileSync(filePath, JSON.stringify(updates, null, 2), 'utf-8');
    return;
  }

  const originalContent = fs.readFileSync(filePath, 'utf-8');
  const lines = originalContent.split('\n');
  
  // Parse the JSON to understand the structure
  const strippedContent = stripJsonComments(originalContent);
  let currentStructure: Record<string, unknown>;
  try {
    currentStructure = JSON.parse(strippedContent);
  } catch (error) {
    // If the current file is invalid JSON, we need to recreate it
    console.error('Invalid JSON in settings file, recreating:', error);
    fs.writeFileSync(filePath, JSON.stringify(updates, null, 2), 'utf-8');
    return;
  }

  // Create a map of env var replacements for quick lookup
  const envVarMap = new Map<string, string>();
  for (const mapping of envVarMappings) {
    const pathStr = mapping.path.join('.');
    envVarMap.set(pathStr, mapping.originalValue);
  }

  // Apply updates to the structure
  const updatedStructure = applyUpdates(currentStructure, updates, []);

  // Update the file line by line
  const updatedLines = updateJsonLines(
    lines,
    currentStructure,
    updatedStructure,
    envVarMap,
  );

  // Write the updated content back to the file
  fs.writeFileSync(filePath, updatedLines.join('\n'), 'utf-8');
}

/**
 * Recursively apply updates to a structure
 */
function applyUpdates(
  current: Record<string, unknown>,
  updates: Record<string, unknown>,
  path: string[],
): Record<string, unknown> {
  const result = { ...current };

  for (const [key, value] of Object.entries(updates)) {
    const currentPath = [...path, key];
    
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      // Recursively update nested objects
      result[key] = applyUpdates(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
        currentPath,
      );
    } else {
      // Direct replacement for primitive values or arrays
      result[key] = value;
    }
  }

  return result;
}

/**
 * Update JSON lines while preserving formatting and comments
 */
function updateJsonLines(
  lines: string[],
  currentStructure: Record<string, unknown>,
  updatedStructure: Record<string, unknown>,
  envVarMap: Map<string, string>,
): string[] {
  // Find all paths that have changed
  const changedPaths = findChangedPaths(currentStructure, updatedStructure);
  
  const updatedLines = [...lines];
  
  // Track the current path in the JSON structure
  const pathStack: string[] = [];
  
  for (let i = 0; i < updatedLines.length; i++) {
    const line = updatedLines[i];
    
    // Skip empty lines and pure comment lines
    if (line.trim() === '' || line.trim().startsWith('//')) {
      continue;
    }
    
    // Parse the line to find key-value pairs
    const keyMatch = line.match(/^\s*"([^"]+)"\s*:\s*/);
    if (keyMatch) {
      const key = keyMatch[1];
      const valueStartIndex = keyMatch[0].length;
      const valueSection = line.substring(valueStartIndex);
      
      // Update the path stack
      if (pathStack.length > 0) {
        // Check if we're at the same level or need to pop
        const currentIndent = line.match(/^(\s*)/)?.[1].length || 0;
        const expectedIndent = (pathStack.length + 1) * 2;
        
        while (pathStack.length > 0 && currentIndent <= expectedIndent - 2) {
          pathStack.pop();
        }
      }
      
      pathStack.push(key);
      const currentPath = pathStack.join('.');
      
      // Check if this path needs updating
      if (changedPaths.has(currentPath)) {
        const newValue = getValueAtPath(updatedStructure, pathStack);
        
        // Check if we should restore an env var reference
        const envVarReference = envVarMap.get(currentPath);
        const valueToWrite = envVarReference || newValue;
        
        // Preserve the original formatting (quotes, trailing comma, etc.)
        const hasTrailingComma = valueSection.trimEnd().endsWith(',');
        const hasComment = valueSection.includes('//');
        
        let newValueStr: string;
        if (typeof valueToWrite === 'string') {
          // For strings, check if it's an env var reference
          if (envVarReference) {
            newValueStr = `"${envVarReference}"`;
          } else {
            newValueStr = JSON.stringify(valueToWrite);
          }
        } else {
          newValueStr = JSON.stringify(valueToWrite);
        }
        
        // Reconstruct the line preserving formatting
        const indent = line.match(/^(\s*)/)?.[1] || '';
        let newLine = `${indent}"${key}": ${newValueStr}`;
        
        if (hasTrailingComma) {
          newLine += ',';
        }
        
        if (hasComment) {
          const commentMatch = valueSection.match(/(\/\/.*)/);
          if (commentMatch) {
            newLine += ' ' + commentMatch[1];
          }
        }
        
        updatedLines[i] = newLine;
      }
      
      // Check if this starts an object or array
      if (valueSection.trimStart().startsWith('{')) {
        // Entering an object, path is already pushed
      } else if (valueSection.trimStart().startsWith('[')) {
        // Arrays are treated as leaf values
        if (changedPaths.has(currentPath)) {
          const newValue = getValueAtPath(updatedStructure, pathStack);
          const indent = line.match(/^(\s*)/)?.[1] || '';
          const hasTrailingComma = line.trimEnd().endsWith(',');
          
          // For arrays, we need to update the entire array
          let newLine = `${indent}"${key}": ${JSON.stringify(newValue)}`;
          if (hasTrailingComma) {
            newLine += ',';
          }
          updatedLines[i] = newLine;
        }
        pathStack.pop(); // Arrays don't nest paths
      } else {
        // It's a leaf value, pop after processing
        pathStack.pop();
      }
    } else if (line.trim() === '}' || line.trim() === '},') {
      // Exiting an object
      if (pathStack.length > 0) {
        pathStack.pop();
      }
    }
  }
  
  // Handle new keys by finding the right insertion point
  const newPaths = Array.from(changedPaths).filter(path => {
    const pathParts = path.split('.');
    return getValueAtPath(currentStructure, pathParts) === undefined;
  });
  
  if (newPaths.length > 0) {
    // For now, if there are new keys, we need to regenerate the file content
    // but preserve comments and env vars as much as possible
    updatedLines.splice(0, updatedLines.length, 
      ...generateJsonWithNewKeys(
        updatedLines, 
        updatedStructure, 
        envVarMap
      )
    );
  }
  
  return updatedLines;
}

/**
 * Generate JSON content with new keys while preserving ALL original comments
 */
function generateJsonWithNewKeys(
  originalLines: string[],
  updatedStructure: Record<string, unknown>, 
  envVarMap: Map<string, string>,
): string[] {
  // Extract all original comments and their positions
  const originalComments = extractOriginalComments(originalLines);
  
  // Generate new JSON with proper formatting
  const jsonString = JSON.stringify(updatedStructure, null, 2);
  const newLines = jsonString.split('\n');

  // Restore environment variable references
  const restoredLines = newLines.map(line => {
    for (const [path, envVarReference] of envVarMap.entries()) {
      const value = getValueAtPath(updatedStructure, path.split('.'));
      if (typeof value === 'string' && line.includes(`"${value}"`)) {
        line = line.replace(`"${value}"`, `"${envVarReference}"`);
      }
    }
    return line;
  });

  // If no original comments, return clean JSON
  if (originalComments.length === 0) {
    return restoredLines;
  }

  // Merge original comments with new structure
  return mergeCommentsWithNewStructure(restoredLines, originalComments);
}

/**
 * Extract all comments from the original file with their context
 */
function extractOriginalComments(lines: string[]): Array<{
  type: 'single' | 'block' | 'inline';
  content: string[];
  beforeKey?: string;
  afterKey?: string;
  indent: number;
}> {
  const comments: Array<{
    type: 'single' | 'block' | 'inline';
    content: string[];
    beforeKey?: string;
    afterKey?: string;
    indent: number;
  }> = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    
    // Single line comment
    if (trimmed.startsWith('//')) {
      const commentLines = [line];
      let j = i + 1;
      
      // Collect consecutive single-line comments
      while (j < lines.length && lines[j].trim().startsWith('//')) {
        commentLines.push(lines[j]);
        j++;
      }
      
      // Find the key this comment is associated with
      let beforeKey: string | undefined;
      let afterKey: string | undefined;
      
      // Look for key after comments
      if (j < lines.length) {
        const keyMatch = lines[j].match(/^\s*"([^"]+)"\s*:/);
        if (keyMatch) {
          beforeKey = keyMatch[1];
        }
      }
      
      comments.push({
        type: 'single',
        content: commentLines,
        beforeKey,
        afterKey,
        indent,
      });
      
      i = j - 1;
    }
    // Block comment start  
    else if (trimmed.startsWith('/*')) {
      const commentLines = [line];
      let j = i + 1;
      
      // Collect until block comment end
      while (j < lines.length && !lines[j - 1].includes('*/')) {
        commentLines.push(lines[j]);
        j++;
      }
      
      comments.push({
        type: 'block',
        content: commentLines,
        indent,
      });
      
      i = j - 1;
    }
    // Inline comment
    else if (line.includes('//')) {
      const keyMatch = line.match(/^\s*"([^"]+)"\s*:/);
      if (keyMatch) {
        const key = keyMatch[1];
        const commentMatch = line.match(/(.*?)(\/\/.*)/);
        if (commentMatch) {
          comments.push({
            type: 'inline',
            content: [commentMatch[2]],
            afterKey: key,
            indent: 0, // Inline comments don't need indent
          });
        }
      }
    }
    
    i++;
  }
  
  return comments;
}

/**
 * Merge original comments with the new JSON structure
 */
function mergeCommentsWithNewStructure(
  newLines: string[],
  originalComments: Array<{
    type: 'single' | 'block' | 'inline';
    content: string[];
    beforeKey?: string;
    afterKey?: string;
    indent: number;
  }>,
): string[] {
  const result: string[] = [];
  
  for (let i = 0; i < newLines.length; i++) {
    const line = newLines[i];
    const keyMatch = line.match(/^\s*"([^"]+)"\s*:/);
    
    if (keyMatch) {
      const key = keyMatch[1];
      
      // Add comments that should appear before this key
      const beforeComments = originalComments.filter(c => c.beforeKey === key);
      for (const comment of beforeComments) {
        if (comment.type === 'single' || comment.type === 'block') {
          result.push(...comment.content);
        }
      }
      
      // Add the line itself
      let lineToAdd = line;
      
      // Add inline comments
      const inlineComment = originalComments.find(c => c.type === 'inline' && c.afterKey === key);
      if (inlineComment && !line.includes('//')) {
        // Remove trailing comma and add comment
        const hasComma = line.endsWith(',');
        const lineWithoutComma = hasComma ? line.slice(0, -1) : line;
        lineToAdd = lineWithoutComma + ' ' + inlineComment.content[0] + (hasComma ? ',' : '');
      }
      
      result.push(lineToAdd);
    } else {
      result.push(line);
    }
  }
  
  // Add any comments that weren't associated with specific keys (like commented-out blocks)
  const orphanComments = originalComments.filter(c => !c.beforeKey && !c.afterKey);
  if (orphanComments.length > 0) {
    // Insert orphan comments in appropriate positions (e.g., in mcpServers section)
    const mcpServersIndex = result.findIndex(line => line.includes('"mcpServers"'));
    if (mcpServersIndex !== -1) {
      // Find the closing brace of mcpServers
      let closingBraceIndex = mcpServersIndex;
      let braceCount = 0;
      for (let i = mcpServersIndex; i < result.length; i++) {
        if (result[i].includes('{')) braceCount++;
        if (result[i].includes('}')) {
          braceCount--;
          if (braceCount === 0) {
            closingBraceIndex = i;
            break;
          }
        }
      }
      
      // Insert orphan comments before the closing brace
      for (const comment of orphanComments) {
        result.splice(closingBraceIndex, 0, ...comment.content);
        closingBraceIndex += comment.content.length;
      }
    }
  }
  
  return result;
}

/**
 * Find all paths that have changed between two structures
 */
function findChangedPaths(
  current: Record<string, unknown>,
  updated: Record<string, unknown>,
  path: string[] = [],
): Set<string> {
  const changedPaths = new Set<string>();
  
  // Check for changes in current structure
  for (const [key, value] of Object.entries(current)) {
    const currentPath = [...path, key];
    const pathStr = currentPath.join('.');
    const updatedValue = updated[key];
    
    if (updatedValue === undefined) {
      // Key was removed
      changedPaths.add(pathStr);
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof updatedValue === 'object' &&
      updatedValue !== null &&
      !Array.isArray(updatedValue)
    ) {
      // Recursively check nested objects
      const nestedChanges = findChangedPaths(
        value as Record<string, unknown>,
        updatedValue as Record<string, unknown>,
        currentPath,
      );
      nestedChanges.forEach((p) => changedPaths.add(p));
    } else if (JSON.stringify(value) !== JSON.stringify(updatedValue)) {
      // Value changed
      changedPaths.add(pathStr);
    }
  }
  
  // Check for new keys in updated structure
  for (const key of Object.keys(updated)) {
    if (!(key in current)) {
      const pathStr = [...path, key].join('.');
      changedPaths.add(pathStr);
    }
  }
  
  return changedPaths;
}

/**
 * Get value at a specific path in an object
 */
function getValueAtPath(
  obj: Record<string, unknown>,
  path: string[],
): unknown {
  let current: unknown = obj;
  
  for (const key of path) {
    if (
      typeof current === 'object' &&
      current !== null &&
      key in (current as Record<string, unknown>)
    ) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  
  return current;
}

/**
 * Track environment variable mappings during settings load
 */
export function trackEnvVarMappings(
  obj: unknown,
  originalObj: unknown,
  path: string[] = [],
): EnvVarMapping[] {
  const mappings: EnvVarMapping[] = [];
  
  if (
    typeof obj !== 'object' ||
    obj === null ||
    typeof originalObj !== 'object' ||
    originalObj === null
  ) {
    return mappings;
  }
  
  for (const key in obj as Record<string, unknown>) {
    const value = (obj as Record<string, unknown>)[key];
    const originalValue = (originalObj as Record<string, unknown>)[key];
    const currentPath = [...path, key];
    
    if (typeof originalValue === 'string' && typeof value === 'string') {
      // Check if original value was an env var reference
      const envVarPattern = /^\$(?:(\w+)|{([^}]+)})$/;
      const match = originalValue.match(envVarPattern);
      
      if (match && value !== originalValue) {
        // This was an env var that got resolved
        mappings.push({
          path: currentPath,
          originalValue,
          resolvedValue: value,
        });
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively track nested objects
      const nestedMappings = trackEnvVarMappings(
        value,
        originalValue,
        currentPath,
      );
      mappings.push(...nestedMappings);
    }
  }
  
  return mappings;
}