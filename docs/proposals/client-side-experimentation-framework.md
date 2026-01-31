# Client-Side Experimentation Framework Proposal for Gemini CLI

> **Status:** Proposal **Author:** Generated Analysis **Date:** January 2026

---

## Executive Summary

This document proposes a standardized framework for implementing client-side
experimental features in Gemini CLI. The goal is to enable developers to ship
features that users can opt into in a controlled, standardized way while
protecting users who don't opt-in.

---

## Table of Contents

1. [Current State Summary](#current-state-summary)
2. [Proposed Design](#proposed-design)
3. [Implementation Details](#implementation-details)
4. [Workflow Integration](#workflow-integration)
5. [User Experience](#user-experience)
6. [Graduation Process](#graduation-process)
7. [Industry Comparison](#industry-comparison)
8. [References](#references)

---

## Current State Summary

### What Gemini CLI Already Has

| Capability                | Location            | Description                                         |
| ------------------------- | ------------------- | --------------------------------------------------- |
| `experimental.*` settings | `settingsSchema.ts` | Boolean toggles for experimental features           |
| `general.previewFeatures` | `settingsSchema.ts` | Preview model access control                        |
| Settings merge hierarchy  | `settings.ts`       | Schema defaults → System → User → Workspace → Admin |
| Agent experimental flags  | `registry.ts`       | `definition.experimental` on agent definitions      |
| Remote admin controls     | `settings.ts`       | Server-side overrides for enterprise                |

### Current Experimental Features

| Feature                | Setting                                   | Default | Purpose                        |
| ---------------------- | ----------------------------------------- | ------- | ------------------------------ |
| Agents                 | `experimental.enableAgents`               | `false` | Enable subagent system         |
| JIT Context            | `experimental.jitContext`                 | `false` | Just-in-time context loading   |
| Event-Driven Scheduler | `experimental.enableEventDrivenScheduler` | `true`  | Event-based task orchestration |
| Plugin Hot-Reload      | `experimental.extensionReloading`         | `false` | Runtime plugin loading         |
| Plugin Configuration   | `experimental.extensionConfig`            | `false` | Plugin settings management     |
| Plugin Management      | `experimental.extensionManagement`        | `true`  | Plugin lifecycle features      |
| Plan Mode              | `experimental.plan`                       | `false` | Read-only planning mode        |
| OSC 52 Paste           | `experimental.useOSC52Paste`              | `false` | Remote session clipboard       |
| Preview Models         | `general.previewFeatures`                 | `false` | Access to preview models       |

### What's Missing

- ❌ Standardized lifecycle for experimental features
- ❌ Clear graduation criteria (experimental → stable)
- ❌ Discoverability of experimental features
- ❌ Telemetry integration for experiment usage tracking
- ❌ Documentation automation for experimental features
- ❌ CLI-level opt-in flags (like Cargo's `-Z` flags)
- ❌ Feature dependency management
- ❌ Deprecation tracking and warnings

---

## Proposed Design

### Multi-Tier Feature Gate System

#### Tier 1: Feature Lifecycle Stages

Adopt a **Kubernetes-inspired maturity model** with clear stages:

| Stage          | Default      | Stability                          | Can Remove?              | Flag Required   |
| -------------- | ------------ | ---------------------------------- | ------------------------ | --------------- |
| **Alpha**      | `false`      | May break, incomplete              | Yes, any time            | Explicit opt-in |
| **Beta**       | `false`      | Mostly stable, collecting feedback | Yes, with deprecation    | Explicit opt-in |
| **GA**         | `true`       | Stable                             | No (breaking change)     | None            |
| **Deprecated** | `true→false` | Stable but discouraged             | After deprecation period | None            |

#### Tier 2: Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Feature Gate Registry                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Feature Definition                                       │   │
│  │  - name: string                                           │   │
│  │  - stage: 'alpha' | 'beta' | 'ga' | 'deprecated'         │   │
│  │  - description: string                                    │   │
│  │  - owner: string (GitHub team/individual)                 │   │
│  │  - trackingIssue: string (GitHub issue URL)               │   │
│  │  - addedIn: string (version)                              │   │
│  │  - targetGAVersion?: string                               │   │
│  │  - telemetryKey?: string                                  │   │
│  │  - requiresRestart: boolean                               │   │
│  │  - dependencies?: string[] (other feature names)          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Activation Methods                            │
│                                                                  │
│  1. Settings File (persistent)                                   │
│     experimental.<featureName>: true                             │
│                                                                  │
│  2. CLI Flag (session-only, like Cargo's -Z)                     │
│     gemini --feature=<name> --feature=<name2>                    │
│     gemini -X <name>                                             │
│                                                                  │
│  3. Environment Variable (CI/testing)                            │
│     GEMINI_FEATURES=<name1>,<name2>                              │
│                                                                  │
│  4. Admin Override (enterprise)                                  │
│     Remote admin controls can force-enable/disable               │
└─────────────────────────────────────────────────────────────────┘
```

#### Tier 3: Activation Priority (highest to lowest)

1. **Admin Override** - Enterprise admins can force-enable or force-disable
2. **CLI Flags** - Session-specific activation via `--feature=X`
3. **Environment Variables** - `GEMINI_FEATURES=X,Y` for CI/testing
4. **Workspace Settings** - `.gemini/settings.json` (if workspace is trusted)
5. **User Settings** - `~/.gemini/settings.json`
6. **System Defaults** - Built-in defaults from feature definition

---

## Implementation Details

### 1. Feature Gate Registry

**File:** `packages/core/src/features/featureGate.ts`

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum FeatureStage {
  /** Experimental, may break, can be removed any time */
  ALPHA = 'alpha',
  /** Mostly stable, collecting feedback, requires deprecation to remove */
  BETA = 'beta',
  /** Stable, always enabled, feature gate no longer needed */
  GA = 'ga',
  /** Stable but discouraged, will be removed in future version */
  DEPRECATED = 'deprecated',
}

export interface FeatureDefinition {
  /** Unique identifier, kebab-case (e.g., "jit-context") */
  name: string;

  /** Current lifecycle stage */
  stage: FeatureStage;

  /** Human-readable description */
  description: string;

  /** GitHub team or individual responsible */
  owner: string;

  /** GitHub issue URL for tracking */
  trackingIssue?: string;

  /** Version when this feature was added */
  addedInVersion: string;

  /** Target version for GA (if alpha/beta) */
  targetGAVersion?: string;

  /** Version when deprecated (if deprecated) */
  deprecatedInVersion?: string;

  /** Version when feature will be removed (if deprecated) */
  removalVersion?: string;

  /** Whether enabling/disabling requires CLI restart */
  requiresRestart: boolean;

  /** Other features this depends on */
  dependencies?: string[];

  /** Key for telemetry tracking */
  telemetryKey?: string;

  /** Warning message shown when feature is enabled */
  warningMessage?: string;

  /** Features that are mutually exclusive with this one */
  conflictsWith?: string[];
}

/**
 * Central registry of all feature gates.
 *
 * To add a new feature:
 * 1. Create a tracking issue
 * 2. Add entry here with stage: ALPHA
 * 3. Implement feature gated by FeatureGateService.isEnabled()
 * 4. Graduate through stages based on feedback
 */
export const FEATURE_GATES: Record<string, FeatureDefinition> = {
  'jit-context': {
    name: 'jit-context',
    stage: FeatureStage.ALPHA,
    description: 'Just-in-time context loading for improved memory usage',
    owner: '@anthropics/gemini-cli',
    trackingIssue: 'https://github.com/google-gemini/gemini-cli/issues/XXX',
    addedInVersion: '0.25.0',
    targetGAVersion: '1.0.0',
    requiresRestart: true,
    telemetryKey: 'feature_jit_context',
    warningMessage:
      'JIT context is experimental and may affect response quality.',
  },

  agents: {
    name: 'agents',
    stage: FeatureStage.ALPHA,
    description: 'Enable subagent system for complex multi-step tasks',
    owner: '@anthropics/gemini-cli',
    trackingIssue: 'https://github.com/google-gemini/gemini-cli/issues/XXX',
    addedInVersion: '0.20.0',
    requiresRestart: false,
    telemetryKey: 'feature_agents',
    warningMessage: 'Agents run in YOLO mode and will auto-approve tool calls.',
  },

  'plan-mode': {
    name: 'plan-mode',
    stage: FeatureStage.BETA,
    description:
      'Read-only planning mode for reviewing changes before execution',
    owner: '@anthropics/gemini-cli',
    trackingIssue: 'https://github.com/google-gemini/gemini-cli/issues/XXX',
    addedInVersion: '0.22.0',
    targetGAVersion: '0.30.0',
    requiresRestart: false,
    telemetryKey: 'feature_plan_mode',
  },

  'event-driven-scheduler': {
    name: 'event-driven-scheduler',
    stage: FeatureStage.BETA,
    description: 'Event-based task orchestration system',
    owner: '@anthropics/gemini-cli',
    addedInVersion: '0.18.0',
    requiresRestart: true,
    telemetryKey: 'feature_event_scheduler',
  },

  // Example of a deprecated feature
  'legacy-context-loading': {
    name: 'legacy-context-loading',
    stage: FeatureStage.DEPRECATED,
    description: 'Legacy context loading (use jit-context instead)',
    owner: '@anthropics/gemini-cli',
    addedInVersion: '0.10.0',
    deprecatedInVersion: '0.25.0',
    removalVersion: '1.0.0',
    requiresRestart: true,
    warningMessage:
      'This feature is deprecated and will be removed in v1.0.0. Migrate to jit-context.',
  },
};

/**
 * Get all features at a specific stage
 */
export function getFeaturesByStage(stage: FeatureStage): FeatureDefinition[] {
  return Object.values(FEATURE_GATES).filter((f) => f.stage === stage);
}

/**
 * Get a feature definition by name
 */
export function getFeature(name: string): FeatureDefinition | undefined {
  return FEATURE_GATES[name];
}

/**
 * Check if a feature name is valid
 */
export function isValidFeature(name: string): boolean {
  return name in FEATURE_GATES;
}
```

### 2. Feature Gate Service

**File:** `packages/core/src/features/featureGateService.ts`

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FEATURE_GATES,
  FeatureStage,
  getFeature,
  isValidFeature,
  type FeatureDefinition,
} from './featureGate.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface FeatureGateServiceConfig {
  /** Features enabled via settings file */
  settingsFeatures: Record<string, boolean>;

  /** Features enabled via CLI flags */
  cliFeatures: string[];

  /** Features enabled via environment variable */
  envFeatures: string[];

  /** Admin overrides (highest priority) */
  adminOverrides: Record<string, boolean>;
}

export class FeatureGateService {
  private readonly enabledFeatures: Set<string> = new Set();
  private readonly config: FeatureGateServiceConfig;

  constructor(config: FeatureGateServiceConfig) {
    this.config = config;
    this.computeEnabledFeatures();
  }

  /**
   * Check if a feature is enabled
   */
  isEnabled(featureName: string): boolean {
    const definition = getFeature(featureName);

    if (!definition) {
      debugLogger.warn(`Unknown feature gate: ${featureName}`);
      return false;
    }

    // GA features are always enabled
    if (definition.stage === FeatureStage.GA) {
      return true;
    }

    // Admin override takes highest priority
    if (this.config.adminOverrides[featureName] !== undefined) {
      return this.config.adminOverrides[featureName];
    }

    return this.enabledFeatures.has(featureName);
  }

  /**
   * Get all currently enabled features
   */
  getEnabledFeatures(): FeatureDefinition[] {
    return [...this.enabledFeatures]
      .map((name) => getFeature(name))
      .filter((f): f is FeatureDefinition => f !== undefined);
  }

  /**
   * Get enabled features at a specific stage
   */
  getEnabledFeaturesAtStage(stage: FeatureStage): FeatureDefinition[] {
    return this.getEnabledFeatures().filter((f) => f.stage === stage);
  }

  /**
   * Get warnings for enabled experimental features
   */
  getStartupWarnings(): string[] {
    const warnings: string[] = [];

    for (const feature of this.getEnabledFeatures()) {
      if (feature.stage === FeatureStage.ALPHA && feature.warningMessage) {
        warnings.push(`⚠️  [ALPHA] ${feature.name}: ${feature.warningMessage}`);
      } else if (
        feature.stage === FeatureStage.DEPRECATED &&
        feature.warningMessage
      ) {
        warnings.push(
          `⚠️  [DEPRECATED] ${feature.name}: ${feature.warningMessage}`,
        );
      }
    }

    return warnings;
  }

  /**
   * Validate feature dependencies
   */
  validateDependencies(): string[] {
    const errors: string[] = [];

    for (const featureName of this.enabledFeatures) {
      const feature = getFeature(featureName);
      if (!feature?.dependencies) continue;

      for (const dep of feature.dependencies) {
        if (!this.isEnabled(dep)) {
          errors.push(
            `Feature "${featureName}" requires "${dep}" to be enabled`,
          );
        }
      }

      // Check for conflicts
      if (feature.conflictsWith) {
        for (const conflict of feature.conflictsWith) {
          if (this.isEnabled(conflict)) {
            errors.push(
              `Feature "${featureName}" conflicts with "${conflict}"`,
            );
          }
        }
      }
    }

    return errors;
  }

  private computeEnabledFeatures(): void {
    this.enabledFeatures.clear();

    // Process in order of priority (lowest to highest)
    // 1. Settings file
    for (const [name, enabled] of Object.entries(
      this.config.settingsFeatures,
    )) {
      if (enabled && isValidFeature(name)) {
        this.enabledFeatures.add(name);
      }
    }

    // 2. Environment variables
    for (const name of this.config.envFeatures) {
      if (isValidFeature(name)) {
        this.enabledFeatures.add(name);
      } else {
        debugLogger.warn(`Unknown feature in GEMINI_FEATURES: ${name}`);
      }
    }

    // 3. CLI flags (can also disable with --no-feature=X)
    for (const name of this.config.cliFeatures) {
      if (name.startsWith('no-')) {
        const featureName = name.slice(3);
        this.enabledFeatures.delete(featureName);
      } else if (isValidFeature(name)) {
        this.enabledFeatures.add(name);
      } else {
        debugLogger.warn(`Unknown feature flag: ${name}`);
      }
    }

    // Note: Admin overrides are checked at runtime in isEnabled()
  }
}
```

### 3. CLI Flag Support

**File:** `packages/cli/src/config/config.ts` (additions)

```typescript
// Add to yargs options
.option('feature', {
  alias: 'X',
  type: 'array',
  string: true,
  description: 'Enable experimental feature(s) for this session. Use --feature=<name> or -X <name>',
  coerce: (features: string[]) =>
    features.flatMap(f => f.split(',').map(x => x.trim())),
})
.option('no-feature', {
  type: 'array',
  string: true,
  description: 'Disable a feature for this session',
  coerce: (features: string[]) =>
    features.flatMap(f => f.split(',').map(x => x.trim())),
})
.option('list-features', {
  type: 'boolean',
  description: 'List all available feature gates and exit',
})
```

### 4. Environment Variable Support

```typescript
// In loadCliConfig or similar
function parseEnvFeatures(): string[] {
  const envValue = process.env['GEMINI_FEATURES'];
  if (!envValue) return [];

  return envValue
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}
```

### 5. `/features` Slash Command

**File:** `packages/cli/src/commands/features.ts`

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FEATURE_GATES,
  FeatureStage,
  getFeaturesByStage,
} from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';

export async function featuresCommand(config: Config): Promise<void> {
  const featureService = config.getFeatureGateService();

  console.log('\n📋 Gemini CLI Feature Gates\n');
  console.log(
    'Feature gates allow you to opt-in to experimental functionality.\n',
  );

  // Alpha features
  const alphaFeatures = getFeaturesByStage(FeatureStage.ALPHA);
  if (alphaFeatures.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ALPHA Features (experimental, may change without notice)');
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n',
    );

    for (const feature of alphaFeatures) {
      const enabled = featureService.isEnabled(feature.name);
      const status = enabled ? '✓ ENABLED' : '○ disabled';

      console.log(`  ${feature.name}`);
      console.log(`    Status: ${status}`);
      console.log(`    ${feature.description}`);
      if (feature.trackingIssue) {
        console.log(`    Tracking: ${feature.trackingIssue}`);
      }
      if (feature.targetGAVersion) {
        console.log(`    Target GA: v${feature.targetGAVersion}`);
      }
      console.log();
    }
  }

  // Beta features
  const betaFeatures = getFeaturesByStage(FeatureStage.BETA);
  if (betaFeatures.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('BETA Features (mostly stable, feedback welcome)');
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n',
    );

    for (const feature of betaFeatures) {
      const enabled = featureService.isEnabled(feature.name);
      const status = enabled ? '✓ ENABLED' : '○ disabled';

      console.log(`  ${feature.name}`);
      console.log(`    Status: ${status}`);
      console.log(`    ${feature.description}`);
      if (feature.trackingIssue) {
        console.log(`    Tracking: ${feature.trackingIssue}`);
      }
      console.log();
    }
  }

  // Deprecated features
  const deprecatedFeatures = getFeaturesByStage(FeatureStage.DEPRECATED);
  if (deprecatedFeatures.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('DEPRECATED Features (will be removed)');
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n',
    );

    for (const feature of deprecatedFeatures) {
      const enabled = featureService.isEnabled(feature.name);
      const status = enabled ? '✓ ENABLED' : '○ disabled';

      console.log(`  ${feature.name}`);
      console.log(`    Status: ${status}`);
      console.log(`    ${feature.description}`);
      if (feature.removalVersion) {
        console.log(`    ⚠️  Will be removed in: v${feature.removalVersion}`);
      }
      console.log();
    }
  }

  // Usage instructions
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('How to Enable Features');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('  CLI flag (session only):');
  console.log('    gemini --feature=<name>');
  console.log('    gemini -X <name>');
  console.log();
  console.log('  Environment variable (CI/testing):');
  console.log('    GEMINI_FEATURES=<name1>,<name2> gemini');
  console.log();
  console.log('  Settings file (persistent):');
  console.log('    Add to ~/.gemini/settings.json:');
  console.log('    { "experimental": { "<name>": true } }');
  console.log();
}
```

### 6. Settings Schema Auto-Generation

**File:** `packages/cli/src/config/settingsSchema.ts` (additions)

```typescript
import { FEATURE_GATES, FeatureStage } from '@google/gemini-cli-core';

/**
 * Auto-generate experimental settings schema from feature definitions.
 * This ensures the settings schema stays in sync with feature gates.
 */
function generateExperimentalSchema(): Record<string, SettingDefinition> {
  const schema: Record<string, SettingDefinition> = {};

  for (const [name, def] of Object.entries(FEATURE_GATES)) {
    // GA features don't need settings (always enabled)
    if (def.stage === FeatureStage.GA) continue;

    // Convert kebab-case to camelCase for settings
    const settingName = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    schema[settingName] = {
      type: 'boolean',
      default: false,
      label: `[${def.stage.toUpperCase()}] ${def.name}`,
      description:
        def.description +
        (def.warningMessage ? ` ⚠️ ${def.warningMessage}` : ''),
      showInDialog: def.stage === FeatureStage.BETA, // Only show beta in settings UI
      requiresRestart: def.requiresRestart,
      ignoreInDocs: def.stage === FeatureStage.ALPHA, // Don't document alpha features
    };
  }

  return schema;
}

// Use in schema definition
export const settingsSchema = {
  // ... other settings ...

  experimental: {
    type: 'object',
    label: 'Experimental Features',
    description:
      'Enable experimental features. Use /features to see all available.',
    properties: generateExperimentalSchema(),
  },
};
```

### 7. Telemetry Integration

**File:** `packages/core/src/telemetry/featureTelemetry.ts`

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getFeature } from '../features/featureGate.js';
import type { Config } from '../config/config.js';

export interface FeatureUsageEvent {
  featureName: string;
  stage: string;
  action: 'enabled' | 'used' | 'error';
  clientVersion: string;
  sessionId: string;
  timestamp: string;
}

/**
 * Log when a feature is enabled at startup
 */
export function logFeatureEnabled(config: Config, featureName: string): void {
  const definition = getFeature(featureName);
  if (!definition?.telemetryKey) return;

  // Use existing telemetry infrastructure
  config.getTelemetryService()?.recordEvent({
    name: 'feature_enabled',
    attributes: {
      feature: featureName,
      stage: definition.stage,
      version: config.getClientVersion(),
    },
  });
}

/**
 * Log when a feature is actively used
 */
export function logFeatureUsed(config: Config, featureName: string): void {
  const definition = getFeature(featureName);
  if (!definition?.telemetryKey) return;

  config.getTelemetryService()?.recordEvent({
    name: 'feature_used',
    attributes: {
      feature: featureName,
      stage: definition.stage,
      version: config.getClientVersion(),
    },
  });
}
```

---

## Workflow Integration

### 1. Feature Tracking Issue Template

**File:** `.github/ISSUE_TEMPLATE/feature-gate.yml`

```yaml
name: Feature Gate Proposal
description: Propose a new experimental feature gate
title: '[Feature Gate] '
labels: ['type/feature-gate', 'stage/alpha']
body:
  - type: markdown
    attributes:
      value: |
        ## Feature Gate Proposal

        Use this template to propose a new experimental feature for Gemini CLI.
        All new features should start as Alpha and graduate through stages.

  - type: input
    id: feature-name
    attributes:
      label: Feature Name
      description: Lowercase, kebab-case identifier (e.g., "jit-context")
      placeholder: my-feature-name
    validations:
      required: true

  - type: dropdown
    id: initial-stage
    attributes:
      label: Initial Stage
      description: Most features should start as Alpha
      options:
        - alpha
        - beta
      default: 0
    validations:
      required: true

  - type: textarea
    id: description
    attributes:
      label: Description
      description: What does this feature do? (This will be shown to users)
      placeholder: A brief description of the feature's functionality
    validations:
      required: true

  - type: textarea
    id: motivation
    attributes:
      label: Motivation
      description: Why is this feature needed? What problem does it solve?
    validations:
      required: true

  - type: input
    id: target-ga
    attributes:
      label: Target GA Version
      description: When do you expect this to be stable? (e.g., "1.0.0")
      placeholder: '1.0.0'

  - type: textarea
    id: graduation-criteria
    attributes:
      label: Graduation Criteria
      description: What needs to happen for this to move from Alpha → Beta → GA?
      value: |
        ### Alpha → Beta
        - [ ] Feature is functionally complete
        - [ ] No critical bugs reported for 2 weeks
        - [ ] Basic documentation exists
        - [ ] Telemetry shows stable usage patterns

        ### Beta → GA
        - [ ] Feature has been in Beta for 4+ weeks
        - [ ] Documentation is complete
        - [ ] No breaking changes planned
        - [ ] Team consensus achieved
    validations:
      required: true

  - type: textarea
    id: warning-message
    attributes:
      label: Warning Message
      description: Optional warning shown when users enable this feature
      placeholder: 'This feature may affect performance in large codebases.'

  - type: checkboxes
    id: requirements
    attributes:
      label: Requirements
      options:
        - label: Requires CLI restart when toggled
        - label: Has dependencies on other features
        - label: Conflicts with other features
```

### 2. Automated Documentation Workflow

**File:** `.github/workflows/docs-features.yml`

```yaml
name: Update Feature Documentation

on:
  push:
    branches: [main]
    paths:
      - 'packages/core/src/features/featureGate.ts'
  workflow_dispatch:

jobs:
  update-docs:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate feature documentation
        run: npm run docs:generate-features

      - name: Check for changes
        id: changes
        run: |
          if [[ -n $(git status --porcelain docs/experimental-features.md) ]]; then
            echo "changed=true" >> $GITHUB_OUTPUT
          fi

      - name: Create Pull Request
        if: steps.changes.outputs.changed == 'true'
        uses: peter-evans/create-pull-request@v5
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: 'docs: Update experimental features documentation'
          title: 'docs: Update experimental features documentation'
          body: |
            This PR was automatically generated to update the experimental features documentation.

            The feature gate definitions in `packages/core/src/features/featureGate.ts` have changed.
          branch: docs/update-features
          labels: documentation,automated
```

### 3. Feature Gate Validation in CI

**File:** `.github/workflows/ci.yml` (additions)

```yaml
validate-features:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Validate feature gates
      run: npm run validate:features
      # This script should:
      # - Check all features have tracking issues
      # - Check deprecated features have removal versions
      # - Check feature names follow conventions
      # - Check for orphaned feature flags in code
```

---

## User Experience

### Enabling via CLI Flag

```bash
# Single feature
gemini --feature=jit-context "Analyze this codebase"

# Short form
gemini -X jit-context "Analyze this codebase"

# Multiple features
gemini --feature=jit-context --feature=agents "Help me refactor"

# Comma-separated
gemini -X jit-context,agents

# Disable a feature for this session
gemini --no-feature=event-driven-scheduler
```

### Enabling via Environment Variable

```bash
# For CI/CD or testing
GEMINI_FEATURES=jit-context,agents gemini -p "Run tests"

# In a shell profile for persistent enablement
export GEMINI_FEATURES=jit-context
```

### Enabling via Settings File

```json
// ~/.gemini/settings.json
{
  "experimental": {
    "jitContext": true,
    "agents": true,
    "planMode": true
  }
}
```

### Listing Features

```
$ gemini --list-features

📋 Gemini CLI Feature Gates

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALPHA Features (experimental, may change without notice)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  jit-context
    Status: ○ disabled
    Just-in-time context loading for improved memory usage
    Tracking: https://github.com/google-gemini/gemini-cli/issues/XXX
    Target GA: v1.0.0

  agents
    Status: ○ disabled
    Enable subagent system for complex multi-step tasks
    Tracking: https://github.com/google-gemini/gemini-cli/issues/XXX

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BETA Features (mostly stable, feedback welcome)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  plan-mode
    Status: ○ disabled
    Read-only planning mode for reviewing changes before execution
    Tracking: https://github.com/google-gemini/gemini-cli/issues/XXX

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
How to Enable Features
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  CLI flag (session only):
    gemini --feature=<name>
    gemini -X <name>

  Environment variable (CI/testing):
    GEMINI_FEATURES=<name1>,<name2> gemini

  Settings file (persistent):
    Add to ~/.gemini/settings.json:
    { "experimental": { "<name>": true } }
```

### Startup Warnings

```
$ gemini --feature=agents

⚠️  Experimental features enabled:
   • [ALPHA] agents: Agents run in YOLO mode and will auto-approve tool calls.

Type /features to learn more about experimental features.

>
```

---

## Graduation Process

### Stage Transitions

```
                    ┌─────────────┐
                    │   ALPHA     │
                    │  (2+ weeks) │
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              │              ▼
     ┌─────────────┐       │       ┌─────────────┐
     │    BETA     │       │       │  REMOVED    │
     │  (4+ weeks) │       │       │  (failed)   │
     └──────┬──────┘       │       └─────────────┘
            │              │
            │              │
            ▼              │
     ┌─────────────┐       │
     │     GA      │◄──────┘
     │  (stable)   │
     └──────┬──────┘
            │
            ▼
     ┌─────────────┐
     │ DEPRECATED  │
     │ (optional)  │
     └──────┬──────┘
            │
            ▼
     ┌─────────────┐
     │  REMOVED    │
     └─────────────┘
```

### Alpha → Beta Criteria

- [ ] Feature is functionally complete
- [ ] At least 2 weeks since Alpha release
- [ ] No critical bugs reported
- [ ] Basic documentation exists
- [ ] Telemetry shows no major issues
- [ ] Tracking issue updated with feedback summary

### Beta → GA Criteria

- [ ] At least 4 weeks in Beta
- [ ] Telemetry shows stable usage patterns
- [ ] Documentation is complete
- [ ] No breaking changes planned
- [ ] Team consensus in tracking issue
- [ ] Feature gate can be removed (always enabled)

### GA → Deprecated Criteria

- [ ] Replacement feature available (if applicable)
- [ ] Deprecation warning added to feature definition
- [ ] Migration guide published
- [ ] Removal version announced (typically N+2 major versions)

### Deprecation Timeline

| Action                   | Timeline    |
| ------------------------ | ----------- |
| Mark as deprecated       | Version N   |
| Log deprecation warnings | Version N   |
| Disable by default       | Version N+1 |
| Remove feature           | Version N+2 |

---

## Industry Comparison

| Aspect             | Gemini CLI (Proposed)    | [Cargo (Rust)](https://doc.rust-lang.org/cargo/reference/unstable.html) | [Kubernetes](https://kubernetes.io/docs/reference/command-line-tools-reference/feature-gates/) |
| ------------------ | ------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Stages**         | Alpha/Beta/GA/Deprecated | Unstable/Stable                                                         | Alpha/Beta/GA                                                                                  |
| **CLI Flag**       | `--feature=X` / `-X`     | `-Z flag`                                                               | `--feature-gates=X=true`                                                                       |
| **Config File**    | `experimental.X: true`   | `[unstable] X = true`                                                   | Component flags                                                                                |
| **Default Off**    | Alpha, Beta              | All unstable                                                            | Alpha only                                                                                     |
| **Nightly Only**   | No (available in all)    | Yes                                                                     | No                                                                                             |
| **Tracking**       | GitHub Issues            | Tracking Issues                                                         | KEPs                                                                                           |
| **Telemetry**      | Optional                 | None                                                                    | Metrics endpoint                                                                               |
| **Admin Override** | Yes                      | No                                                                      | No                                                                                             |

---

## References

### Open Source Feature Flag Tools

- [OpenFeature](https://openfeature.dev/) - Vendor-agnostic feature flagging
  specification (CNCF)
- [GrowthBook](https://www.growthbook.io/) - Open source feature flags and A/B
  testing
- [Flagsmith](https://www.flagsmith.com/) - Open source feature flag service
- [Unleash](https://www.getunleash.io/) - Open source feature management

### CLI Tool Implementations

- [Cargo Unstable Features](https://doc.rust-lang.org/cargo/reference/unstable.html) -
  Rust's package manager experimental features
- [Kubernetes Feature Gates](https://kubernetes.io/docs/reference/command-line-tools-reference/feature-gates/) -
  K8s feature gate system
- [Feature Flags Best Practices - LaunchDarkly](https://launchdarkly.com/blog/what-are-feature-flags/)

### Internal References

- Current experimental settings: `packages/cli/src/config/settingsSchema.ts`
- Settings merge logic: `packages/cli/src/config/settings.ts`
- Agent experimental flags: `packages/core/src/agents/registry.ts`
- Release workflows: `.github/workflows/release-*.yml`

---

## Appendix: Migration Path

### Migrating Existing Experimental Features

The following existing experimental settings should be migrated to the new
feature gate system:

| Current Setting                           | New Feature Gate         | Stage |
| ----------------------------------------- | ------------------------ | ----- |
| `experimental.enableAgents`               | `agents`                 | Alpha |
| `experimental.jitContext`                 | `jit-context`            | Alpha |
| `experimental.plan`                       | `plan-mode`              | Beta  |
| `experimental.enableEventDrivenScheduler` | `event-driven-scheduler` | Beta  |
| `experimental.extensionReloading`         | `extension-reloading`    | Alpha |
| `experimental.extensionConfig`            | `extension-config`       | Alpha |
| `experimental.useOSC52Paste`              | `osc52-paste`            | Alpha |
| `general.previewFeatures`                 | `preview-models`         | Beta  |

A migration script should:

1. Read existing settings
2. Map to new feature gate names
3. Preserve user preferences
4. Log migration actions
