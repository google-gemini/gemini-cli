/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a single tool definition in the manifest
 */
export interface ToolDefinition {
  /** The actual tool name used for API calls */
  name: string;
  /** Version of the tool */
  version: string;
  /** Human-readable description of the tool */
  description: string;
}

/**
 * Represents a category of tools (e.g., file_operations, search_operations)
 */
export interface ToolCategory {
  [toolKey: string]: ToolDefinition;
}

/**
 * Complete tool manifest structure
 */
export interface ToolManifest {
  /** Version of the manifest format */
  manifest_version: string;
  /** Last updated timestamp or date */
  last_updated: string;
  /** Organized tool definitions by category */
  tools: {
    [categoryName: string]: ToolCategory;
  };
  /** Reference mappings for tool name resolution */
  tool_references: {
    [referenceKey: string]: string;
  };
}

/**
 * Configuration options for the ToolManifestLoader
 */
export interface ToolManifestLoaderOptions {
  /** Path to the tool manifest file */
  manifestPath?: string;
  /** Whether to cache the loaded manifest */
  enableCaching?: boolean;
  /** Whether to validate the manifest schema */
  validateSchema?: boolean;
}

/**
 * Result of tool name resolution
 */
export interface ToolResolutionResult {
  /** The resolved tool name */
  name: string;
  /** The tool definition if found */
  definition?: ToolDefinition;
  /** Whether the resolution was successful */
  success: boolean;
  /** Error message if resolution failed */
  error?: string;
}
