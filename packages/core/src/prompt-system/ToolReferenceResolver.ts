/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolManifestLoader } from './ToolManifestLoader.js';

/**
 * Utility class for resolving tool references in prompts and other text
 */
export class ToolReferenceResolver {
  private static instance: ToolReferenceResolver | null = null;
  private readonly manifestLoader: ToolManifestLoader;

  constructor(manifestLoader?: ToolManifestLoader) {
    this.manifestLoader = manifestLoader || ToolManifestLoader.getInstance();
  }

  /**
   * Gets the singleton instance of ToolReferenceResolver
   */
  static getInstance(): ToolReferenceResolver {
    if (!ToolReferenceResolver.instance) {
      ToolReferenceResolver.instance = new ToolReferenceResolver();
    }
    return ToolReferenceResolver.instance;
  }

  /**
   * Resolves tool references in a template string
   * Supports both ${TOOL_REFERENCE} and {{TOOL_REFERENCE}} formats
   */
  resolveTemplate(template: string): string {
    let resolved = template;

    // Pattern to match ${REFERENCE} and {{REFERENCE}} formats
    const patterns = [
      /\$\{([A-Z_]+(?:\.[A-Z_]+)*)\}/g, // ${TOOL_REFERENCE}
      /\{\{([A-Z_]+(?:\.[A-Z_]+)*)\}\}/g, // {{TOOL_REFERENCE}}
    ];

    for (const pattern of patterns) {
      resolved = resolved.replace(pattern, (match, reference) => {
        const result = this.manifestLoader.resolveToolReference(reference);
        if (result.success) {
          return result.name;
        }

        // Log warning but continue with original reference for backward compatibility
        console.warn(
          `Warning: Could not resolve tool reference '${reference}': ${result.error || 'Unknown error'}`,
        );
        return match; // Return the original match if resolution fails
      });
    }

    return resolved;
  }

  /**
   * Resolves a single tool reference
   */
  resolveReference(reference: string): string {
    const result = this.manifestLoader.resolveToolReference(reference);
    if (result.success) {
      return result.name;
    }

    console.warn(
      `Warning: Could not resolve tool reference '${reference}': ${result.error || 'Unknown error'}`,
    );
    return reference; // Return original reference if resolution fails
  }

  /**
   * Gets all available tool references
   */
  getAvailableReferences(): string[] {
    return this.manifestLoader.getAvailableReferences();
  }

  /**
   * Gets all available tool names
   */
  getAvailableToolNames(): string[] {
    return this.manifestLoader.getAvailableToolNames();
  }

  /**
   * Validates that all references in a template can be resolved
   */
  validateTemplate(template: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Pattern to match ${REFERENCE} and {{REFERENCE}} formats
    const patterns = [
      /\$\{([A-Z_]+(?:\.[A-Z_]+)*)\}/g, // ${TOOL_REFERENCE}
      /\{\{([A-Z_]+(?:\.[A-Z_]+)*)\}\}/g, // {{TOOL_REFERENCE}}
    ];

    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex state

      while ((match = pattern.exec(template)) !== null) {
        const reference = match[1];
        const result = this.manifestLoader.resolveToolReference(reference);

        if (!result.success) {
          errors.push(
            `Invalid tool reference '${reference}': ${result.error || 'Unknown error'}`,
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Convenience function to resolve tool references in templates
 */
export function resolveToolReferences(template: string): string {
  return ToolReferenceResolver.getInstance().resolveTemplate(template);
}

/**
 * Convenience function to resolve a single tool reference
 */
export function resolveToolReference(reference: string): string {
  return ToolReferenceResolver.getInstance().resolveReference(reference);
}
