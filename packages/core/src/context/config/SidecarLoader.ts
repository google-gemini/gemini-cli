/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../../config/config.js';
import type { SidecarConfig } from './types.js';
import { defaultSidecarProfile, type ContextProfile } from './profiles.js';
import { SchemaValidator } from '../../utils/schemaValidator.js';
import { getSidecarConfigSchema } from './schema.js';
import type { SidecarRegistry } from './registry.js';
import type { IFileSystem } from '../system/IFileSystem.js';
import { NodeFileSystem } from '../system/NodeFileSystem.js';

export class SidecarLoader {
  /**
   * Loads and validates a sidecar config from a specific file path.
   * Throws an error if the file cannot be read, parsed, or fails schema validation.
   */
  static loadFromFile(
    sidecarPath: string,
    registry: SidecarRegistry,
    fileSystem: IFileSystem = new NodeFileSystem(),
  ): ContextProfile {
    const fileContent = fileSystem.readFileSync(sidecarPath, 'utf8');

    if (!fileContent.trim()) {
      throw new Error(`Sidecar configuration file at ${sidecarPath} is empty.`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fileContent);
    } catch (error) {
      throw new Error(
        `Failed to parse Sidecar configuration file at ${sidecarPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Validate the complete structure, including deep options
    const validationError = SchemaValidator.validate(
      getSidecarConfigSchema(registry),
      parsed,
    );

    if (validationError) {
      throw new Error(
        `Invalid sidecar configuration in ${sidecarPath}. Validation error: ${validationError}`,
      );
    }

    // Extract strictly what we need.
    // Why this unsafe cast is acceptable:
    // SchemaValidator just ran \`getSidecarConfigSchema(registry)\` against \`parsed\`.
    // That function dynamically maps the \`processorOptions\` to strict JSON schema definitions,
    // so we know with absolute certainty at runtime that \`parsed\` conforms to this shape.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const validConfig = parsed as {
      budget?: SidecarConfig['budget'];
      processorOptions?: SidecarConfig['processorOptions'];
    };

    return {
      ...defaultSidecarProfile,
      config: {
        ...defaultSidecarProfile.config,
        ...(validConfig.budget ? { budget: validConfig.budget } : {}),
        ...(validConfig.processorOptions
          ? { processorOptions: validConfig.processorOptions }
          : {}),
      },
    };
  }

  /**
   * Generates a Sidecar JSON graph from the experimental config file path or defaults.
   * If a config file is present but invalid, this will THROW to prevent silent misconfiguration.
   */
  static fromConfig(
    config: Config,
    registry: SidecarRegistry,
    fileSystem: IFileSystem = new NodeFileSystem(),
  ): ContextProfile {
    const sidecarPath = config.getExperimentalContextManagementConfig();

    if (sidecarPath && fileSystem.existsSync(sidecarPath)) {
      const size = fileSystem.statSyncSize(sidecarPath);
      // If the file exists but is completely empty (0 bytes), it's safe to fallback.
      if (size === 0) {
        return defaultSidecarProfile;
      }

      // If the file has content, enforce strict validation and throw on failure.
      return this.loadFromFile(sidecarPath, registry, fileSystem);
    }

    return defaultSidecarProfile;
  }
}
