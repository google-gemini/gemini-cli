/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ToolManifest,
  ToolManifestLoaderOptions,
  ToolResolutionResult,
  ToolDefinition,
} from './interfaces/tool-manifest.js';

/**
 * Loads and manages the tool manifest for dynamic tool reference resolution
 */
export class ToolManifestLoader {
  private static instance: ToolManifestLoader | null = null;
  private manifest: ToolManifest | null = null;
  private readonly options: Required<ToolManifestLoaderOptions>;

  /**
   * Creates a new ToolManifestLoader instance
   */
  constructor(options: ToolManifestLoaderOptions = {}) {
    // Get the directory of this file and construct default manifest path
    const currentFileUrl = import.meta.url;
    const currentDir = path.dirname(fileURLToPath(currentFileUrl));
    const defaultManifestPath = path.join(
      currentDir,
      'schemas',
      'tool-manifest.json',
    );

    this.options = {
      manifestPath: options.manifestPath || defaultManifestPath,
      enableCaching: options.enableCaching ?? true,
      validateSchema: options.validateSchema ?? true,
    };
  }

  /**
   * Gets the singleton instance of ToolManifestLoader
   */
  static getInstance(options?: ToolManifestLoaderOptions): ToolManifestLoader {
    if (!ToolManifestLoader.instance) {
      ToolManifestLoader.instance = new ToolManifestLoader(options);
    }
    return ToolManifestLoader.instance;
  }

  /**
   * Loads the tool manifest from the specified file
   */
  private loadManifest(): ToolManifest {
    if (this.manifest && this.options.enableCaching) {
      return this.manifest;
    }

    try {
      const manifestContent = fs.readFileSync(
        this.options.manifestPath,
        'utf8',
      );
      const parsedManifest = JSON.parse(manifestContent) as ToolManifest;

      if (this.options.validateSchema) {
        this.validateManifest(parsedManifest);
      }

      if (this.options.enableCaching) {
        this.manifest = parsedManifest;
      }

      return parsedManifest;
    } catch (error) {
      throw new Error(
        `Failed to load tool manifest from ${this.options.manifestPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Validates the basic structure of the manifest
   */
  private validateManifest(
    manifest: unknown,
  ): asserts manifest is ToolManifest {
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('Manifest must be a valid JSON object');
    }

    const typedManifest = manifest as Record<string, unknown>;

    if (
      !typedManifest.manifest_version ||
      typeof typedManifest.manifest_version !== 'string'
    ) {
      throw new Error('Manifest must have a valid manifest_version');
    }

    if (!typedManifest.tools || typeof typedManifest.tools !== 'object') {
      throw new Error('Manifest must have a tools section');
    }

    if (
      !typedManifest.tool_references ||
      typeof typedManifest.tool_references !== 'object'
    ) {
      throw new Error('Manifest must have a tool_references section');
    }
  }

  /**
   * Resolves a tool reference path to the actual tool name
   */
  private resolveReferencePath(
    referencePath: string,
    manifest: ToolManifest,
  ): string | null {
    const pathParts = referencePath.split('.');

    if (pathParts.length < 3) {
      return null; // Invalid path format
    }

    // Navigate through the manifest structure
    // Expected format: "category.tool.property" (e.g., "file_operations.read.name")
    const [categoryName, toolKey, property] = pathParts;

    const category = manifest.tools[categoryName];
    if (!category) {
      return null;
    }

    const tool = category[toolKey];
    if (!tool) {
      return null;
    }

    // Currently only supporting "name" property
    if (property === 'name') {
      return tool.name;
    }

    return null;
  }

  /**
   * Resolves a tool reference to the actual tool name
   */
  resolveToolReference(reference: string): ToolResolutionResult {
    try {
      const manifest = this.loadManifest();

      // First, check if this is a direct reference key
      const referencePath = manifest.tool_references[reference];
      if (referencePath) {
        const resolvedName = this.resolveReferencePath(referencePath, manifest);
        if (resolvedName) {
          // Try to find the tool definition
          const definition = this.findToolDefinition(resolvedName, manifest);
          return {
            name: resolvedName,
            definition,
            success: true,
          };
        }
      }

      // If not found as a reference, try direct tool name lookup
      const definition = this.findToolDefinition(reference, manifest);
      if (definition) {
        return {
          name: reference,
          definition,
          success: true,
        };
      }

      return {
        name: reference,
        success: false,
        error: `Tool reference '${reference}' not found in manifest`,
      };
    } catch (error) {
      return {
        name: reference,
        success: false,
        error: `Failed to resolve tool reference: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Finds a tool definition by name across all categories
   */
  private findToolDefinition(
    toolName: string,
    manifest: ToolManifest,
  ): ToolDefinition | undefined {
    for (const category of Object.values(manifest.tools)) {
      for (const tool of Object.values(category)) {
        if (tool.name === toolName) {
          return tool;
        }
      }
    }
    return undefined;
  }

  /**
   * Gets all available tool references
   */
  getAvailableReferences(): string[] {
    try {
      const manifest = this.loadManifest();
      return Object.keys(manifest.tool_references);
    } catch {
      return [];
    }
  }

  /**
   * Gets all available tool names
   */
  getAvailableToolNames(): string[] {
    try {
      const manifest = this.loadManifest();
      const toolNames: string[] = [];

      for (const category of Object.values(manifest.tools)) {
        for (const tool of Object.values(category)) {
          toolNames.push(tool.name);
        }
      }

      return toolNames;
    } catch {
      return [];
    }
  }

  /**
   * Reloads the manifest from disk (clears cache)
   */
  reload(): void {
    this.manifest = null;
  }

  /**
   * Gets the current manifest version
   */
  getManifestVersion(): string | null {
    try {
      const manifest = this.loadManifest();
      return manifest.manifest_version;
    } catch {
      return null;
    }
  }
}
