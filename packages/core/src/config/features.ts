/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '../utils/debugLogger.js';

/**
 * FeatureStage indicates the maturity level of a feature.
 * Strictly aligned with Kubernetes Feature Gates.
 */
export enum FeatureStage {
  /**
   * Alpha features are disabled by default and may be unstable.
   */
  Alpha = 'ALPHA',
  /**
   * Beta features are enabled by default and are considered stable.
   */
  Beta = 'BETA',
  /**
   * GA features are stable and locked to enabled.
   */
  GA = 'GA',
  /**
   * Deprecated features are scheduled for removal.
   */
  Deprecated = 'DEPRECATED',
}

/**
 * FeatureSpec defines the behavior and metadata of a feature at a specific version.
 */
export interface FeatureSpec {
  /**
   * Default enablement state.
   * If not provided, defaults to:
   * - Alpha: false
   * - Beta: true
   * - GA: true
   * - Deprecated: false
   */
  default?: boolean;
  /**
   * If true, the feature cannot be changed from its default value.
   * Defaults to:
   * - GA: true
   * - Others: false
   */
  lockToDefault?: boolean;
  /**
   * The maturity stage of the feature.
   */
  preRelease: FeatureStage;
  /**
   * The version since this spec became valid.
   */
  since?: string;
  /**
   * The version until which this spec is valid or scheduled for removal.
   */
  until?: string;
  /**
   * Description of the feature.
   */
  description?: string;
}

/**
 * FeatureInfo provides a summary of a feature's current state and metadata.
 */
export interface FeatureInfo {
  key: string;
  enabled: boolean;
  stage: FeatureStage;
  since?: string;
  until?: string;
  description?: string;
}

/**
 * FeatureGate provides a read-only interface to query feature status.
 */
export interface FeatureGate {
  /**
   * Returns true if the feature is enabled.
   */
  enabled(key: string): boolean;
  /**
   * Returns all known feature keys.
   */
  knownFeatures(): string[];
  /**
   * Returns all features with their status and metadata.
   */
  getFeatureInfo(): FeatureInfo[];
  /**
   * Returns a mutable copy of the current gate.
   */
  deepCopy(): MutableFeatureGate;
}

/**
 * MutableFeatureGate allows registering and configuring features.
 */
export interface MutableFeatureGate extends FeatureGate {
  /**
   * Adds new features or updates existing ones with versioned specs.
   */
  add(features: Record<string, FeatureSpec[]>): void;
  /**
   * Sets feature states from a comma-separated string (e.g., "Foo=true,Bar=false").
   */
  set(instance: string): void;
  /**
   * Sets feature states from a map.
   */
  setFromMap(m: Record<string, boolean>): void;
}

class FeatureGateImpl implements MutableFeatureGate {
  private specs: Map<string, FeatureSpec[]> = new Map();
  private overrides: Map<string, boolean> = new Map();
  private warnedFeatures: Set<string> = new Set();

  add(features: Record<string, FeatureSpec[]>): void {
    for (const [key, specs] of Object.entries(features)) {
      this.specs.set(key, specs);
    }
  }

  set(instance: string): void {
    const pairs = instance.split(',');
    for (const pair of pairs) {
      const eqIndex = pair.indexOf('=');
      if (eqIndex !== -1) {
        const key = pair.slice(0, eqIndex).trim();
        const value = pair.slice(eqIndex + 1).trim();
        if (key) {
          this.overrides.set(key, value.toLowerCase() === 'true');
        }
      }
    }
  }

  setFromMap(m: Record<string, boolean>): void {
    for (const [key, value] of Object.entries(m)) {
      this.overrides.set(key, value);
    }
  }

  enabled(key: string): boolean {
    const specs = this.specs.get(key);
    if (!specs || specs.length === 0) {
      return false;
    }

    // Get the latest spec (for now, just the last one in the array)
    const latestSpec = specs[specs.length - 1];

    const isLocked =
      latestSpec.lockToDefault ?? latestSpec.preRelease === FeatureStage.GA;

    if (isLocked) {
      return latestSpec.default ?? true; // Locked features (GA) must be enabled unless explicitly disabled (rare)
    }

    const override = this.overrides.get(key);
    if (override !== undefined) {
      if (
        latestSpec.preRelease === FeatureStage.Deprecated &&
        !this.warnedFeatures.has(key)
      ) {
        debugLogger.warn(
          `[WARNING] Feature "${key}" is deprecated and will be removed in a future release.`,
        );
        this.warnedFeatures.add(key);
      }
      return override;
    }

    // Handle stage-wide defaults if set (e.g., allAlpha, allBeta)
    if (latestSpec.preRelease === FeatureStage.Alpha) {
      const allAlpha = this.overrides.get('allAlpha');
      if (allAlpha !== undefined) return allAlpha;
    }
    if (latestSpec.preRelease === FeatureStage.Beta) {
      const allBeta = this.overrides.get('allBeta');
      if (allBeta !== undefined) return allBeta;
    }

    if (latestSpec.default !== undefined) {
      return latestSpec.default;
    }

    // Auto-default based on stage
    return (
      latestSpec.preRelease === FeatureStage.Beta ||
      latestSpec.preRelease === FeatureStage.GA
    );
  }

  knownFeatures(): string[] {
    return Array.from(this.specs.keys());
  }

  getFeatureInfo(): FeatureInfo[] {
    return Array.from(this.specs.entries())
      .map(([key, specs]) => {
        const latestSpec = specs[specs.length - 1];
        return {
          key,
          enabled: this.enabled(key),
          stage: latestSpec.preRelease,
          since: latestSpec.since,
          until: latestSpec.until,
          description: latestSpec.description,
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  deepCopy(): MutableFeatureGate {
    const copy = new FeatureGateImpl();
    copy.specs = new Map(
      Array.from(this.specs.entries()).map(([k, v]) => [k, [...v]]),
    );
    copy.overrides = new Map(this.overrides);
    // warnedFeatures are not copied, we want to warn again in a new context if needed
    return copy;
  }
}

/**
 * Global default feature gate.
 */
export const DefaultFeatureGate: MutableFeatureGate = new FeatureGateImpl();

/**
 * Registry of core features.
 */
export const FeatureDefinitions: Record<string, FeatureSpec[]> = {
  toolOutputMasking: [
    {
      preRelease: FeatureStage.Beta,
      since: '0.30.0',
      description: 'Enables tool output masking to save tokens.',
    },
  ],
  enableAgents: [
    {
      preRelease: FeatureStage.Alpha,
      since: '0.30.0',
      description: 'Enable local and remote subagents.',
    },
  ],
  extensionManagement: [
    {
      preRelease: FeatureStage.Beta,
      since: '0.30.0',
      description: 'Enable extension management features.',
    },
  ],
  extensionConfig: [
    {
      preRelease: FeatureStage.Beta,
      since: '0.30.0',
      description: 'Enable requesting and fetching of extension settings.',
    },
  ],
  extensionRegistry: [
    {
      preRelease: FeatureStage.Alpha,
      since: '0.30.0',
      description: 'Enable extension registry explore UI.',
    },
  ],
  extensionReloading: [
    {
      preRelease: FeatureStage.Alpha,
      since: '0.30.0',
      description:
        'Enables extension loading/unloading within the CLI session.',
    },
  ],
  jitContext: [
    {
      preRelease: FeatureStage.Alpha,
      since: '0.30.0',
      description: 'Enable Just-In-Time (JIT) context loading.',
    },
  ],
  useOSC52Paste: [
    {
      preRelease: FeatureStage.Alpha,
      since: '0.30.0',
      description: 'Use OSC 52 sequence for pasting.',
    },
  ],
  plan: [
    {
      preRelease: FeatureStage.Alpha,
      since: '0.30.0',
      description: 'Enable planning features (Plan Mode and tools).',
    },
  ],
  zedIntegration: [
    {
      preRelease: FeatureStage.Alpha,
      since: '0.30.0',
      description: 'Enable Zed integration.',
    },
  ],
};

// Register core features
DefaultFeatureGate.add(FeatureDefinitions);
