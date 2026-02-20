/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ExperimentFlags,
  ExperimentMetadata,
  getExperimentFlagName,
  type ExperimentMetadataEntry,
} from '../code_assist/experiments/flagNames.js';
import type { Experiments } from '../code_assist/experiments/experiments.js';
import { debugLogger } from '../utils/debugLogger.js';
import { z } from 'zod';

export interface ExperimentManagerOptions {
  experimentalSettings?: Record<string, unknown>;
  experimentalCliArgs?: Record<string, unknown>;
  experiments?: Experiments;
}

/**
 * Manages resolution and validation of experimental flags.
 */
export class ExperimentManager {
  private experimentalSettings: Record<string, unknown>;
  private readonly experimentalCliArgs: Record<string, unknown>;
  private experiments?: Experiments;

  constructor(options: ExperimentManagerOptions) {
    this.experimentalSettings = options.experimentalSettings ?? {};
    this.experimentalCliArgs = options.experimentalCliArgs ?? {};
    this.experiments = options.experiments;
  }

  /**
   * Resolves the value of an experiment flag, applying layering logic:
   * 1. Command-line argument
   * 2. Local setting (settings.json)
   * 3. Remote experiment (server-side)
   * 4. Default value (from metadata)
   */
  getExperimentValue<T>(flagId: number): T {
    const metadata = ExperimentMetadata[flagId];
    if (!metadata) {
      debugLogger.warn(`Unknown experiment flag ID: ${flagId}`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return undefined as unknown as T;
    }

    const flagName = getExperimentFlagName(flagId);

    // 1. CLI Argument
    if (flagName && this.experimentalCliArgs[flagName] !== undefined) {
      let val: unknown = this.experimentalCliArgs[flagName];
      // Type coercion for CLI args
      val = this.coerceValue(val, metadata);

      const result = metadata.schema.safeParse(val);
      if (result.success) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        return result.data as T;
      }
      debugLogger.warn(
        `Invalid CLI value for ${flagName}: ${val}. Error: ${result.error.message}`,
      );
    }

    // 2. Local Setting (settings.json)
    const settingKey = metadata.settingKey || flagName;
    if (settingKey) {
      const val = this.getNestedValue(this.experimentalSettings, settingKey);
      if (val !== undefined) {
        const result = metadata.schema.safeParse(val);
        if (result.success) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          return result.data as T;
        }
        debugLogger.warn(
          `Invalid local setting for ${settingKey}: ${val}. Error: ${result.error.message}`,
        );
      }
    }

    // 3. Remote Experiment
    const remoteFlag = this.experiments?.flags[flagId];
    if (remoteFlag) {
      let val: unknown =
        remoteFlag.boolValue ??
        remoteFlag.floatValue ??
        (remoteFlag.intValue ? Number(remoteFlag.intValue) : undefined) ??
        remoteFlag.stringValue;

      if (val !== undefined) {
        val = this.coerceValue(val, metadata);
        const result = metadata.schema.safeParse(val);
        if (result.success) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          return result.data as T;
        }
        debugLogger.warn(
          `Invalid remote value for flag ${flagId}: ${val}. Error: ${result.error.message}`,
        );
      }
    }

    // 4. Default Value
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return metadata.defaultValue as T;
  }

  private coerceValue(
    val: unknown,
    metadata: ExperimentMetadataEntry,
  ): unknown {
    if (metadata.schema instanceof z.ZodNumber && typeof val === 'string') {
      const num = Number(val);
      if (!isNaN(num)) return num;
    }
    if (metadata.schema instanceof z.ZodBoolean && typeof val === 'string') {
      if (val === 'true' || val === 'on') return true;
      if (val === 'false' || val === 'off') return false;
    }
    return val;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || typeof current !== 'object') return undefined;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /**
   * Updates the local experimental settings.
   */
  updateExperimentalSettings(settings: Record<string, unknown>): void {
    this.experimentalSettings = {
      ...this.experimentalSettings,
      ...settings,
    };
  }

  /**
   * Updates remote experiments.
   */
  setExperiments(experiments: Experiments): void {
    this.experiments = experiments;
  }

  /**
   * Gets all experimental settings (for serialization/display).
   */
  getExperimentalSettings(): Record<string, unknown> {
    return this.experimentalSettings;
  }

  getExperiments(): Experiments | undefined {
    return this.experiments;
  }

  // Convenience getters for commonly used flags

  isPlanEnabled(): boolean {
    return this.getExperimentValue<boolean>(ExperimentFlags.PLAN);
  }

  isAgentsEnabled(): boolean {
    return this.getExperimentValue<boolean>(ExperimentFlags.ENABLE_AGENTS);
  }

  getEnableExtensionReloading(): boolean {
    return this.getExperimentValue<boolean>(
      ExperimentFlags.EXTENSION_RELOADING,
    );
  }

  getDisableLLMCorrection(): boolean {
    return this.getExperimentValue<boolean>(
      ExperimentFlags.DISABLE_LLM_CORRECTION,
    );
  }

  isModelSteeringEnabled(): boolean {
    return this.getExperimentValue<boolean>(ExperimentFlags.MODEL_STEERING);
  }

  isJitContextEnabled(): boolean {
    return this.getExperimentValue<boolean>(ExperimentFlags.JIT_CONTEXT);
  }

  isNumericalRoutingEnabled(): boolean {
    return this.getExperimentValue<boolean>(
      ExperimentFlags.ENABLE_NUMERICAL_ROUTING,
    );
  }

  getClassifierThreshold(): number | undefined {
    return this.getExperimentValue<number>(
      ExperimentFlags.CLASSIFIER_THRESHOLD,
    );
  }

  getUserCaching(): boolean {
    return this.getExperimentValue<boolean>(ExperimentFlags.USER_CACHING);
  }

  getBannerTextNoCapacityIssues(): string {
    return this.getExperimentValue<string>(
      ExperimentFlags.BANNER_TEXT_NO_CAPACITY_ISSUES,
    );
  }

  getBannerTextCapacityIssues(): string {
    return this.getExperimentValue<string>(
      ExperimentFlags.BANNER_TEXT_CAPACITY_ISSUES,
    );
  }
}
