/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { it, expect, describe, vi } from 'vitest';
import { DefaultFeatureGate, FeatureStage } from './features.js';
import { debugLogger } from '../utils/debugLogger.js';

describe('FeatureGate', () => {
  it('should resolve default values', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      testAlpha: [
        {
          default: false,
          lockToDefault: false,
          preRelease: FeatureStage.Alpha,
        },
      ],
      testBeta: [
        { default: true, lockToDefault: false, preRelease: FeatureStage.Beta },
      ],
    });
    expect(gate.enabled('testAlpha')).toBe(false);
    expect(gate.enabled('testBeta')).toBe(true);
  });

  it('should infer default values from stage', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      autoAlpha: [{ lockToDefault: false, preRelease: FeatureStage.Alpha }],
      autoBeta: [{ lockToDefault: false, preRelease: FeatureStage.Beta }],
      autoGA: [{ lockToDefault: true, preRelease: FeatureStage.GA }],
      autoDeprecated: [
        { lockToDefault: false, preRelease: FeatureStage.Deprecated },
      ],
    });
    expect(gate.enabled('autoAlpha')).toBe(false);
    expect(gate.enabled('autoBeta')).toBe(true);
    expect(gate.enabled('autoGA')).toBe(true);
    expect(gate.enabled('autoDeprecated')).toBe(false);
  });

  it('should infer lockToDefault from stage', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      autoLockedGA: [{ preRelease: FeatureStage.GA }],
      autoUnlockedAlpha: [{ preRelease: FeatureStage.Alpha }],
    });

    // Attempt to disable both
    gate.setFromMap({ autoLockedGA: false, autoUnlockedAlpha: true });

    // GA should remain enabled (locked)
    expect(gate.enabled('autoLockedGA')).toBe(true);
    // Alpha should respect override (unlocked)
    expect(gate.enabled('autoUnlockedAlpha')).toBe(true);
  });

  it('should respect explicit default even if stage default differs', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      offBeta: [
        { default: false, lockToDefault: false, preRelease: FeatureStage.Beta },
      ],
      onAlpha: [
        { default: true, lockToDefault: false, preRelease: FeatureStage.Alpha },
      ],
    });
    expect(gate.enabled('offBeta')).toBe(false);
    expect(gate.enabled('onAlpha')).toBe(true);
  });

  it('should respect manual overrides', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      testAlpha: [
        {
          default: false,
          lockToDefault: false,
          preRelease: FeatureStage.Alpha,
        },
      ],
    });
    gate.setFromMap({ testAlpha: true });
    expect(gate.enabled('testAlpha')).toBe(true);
  });

  it('should respect lockToDefault', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      testGA: [
        { default: true, lockToDefault: true, preRelease: FeatureStage.GA },
      ],
    });
    // Attempt to disable GA feature
    gate.setFromMap({ testGA: false });
    expect(gate.enabled('testGA')).toBe(true);
  });

  it('should respect allAlpha/allBeta toggles', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      alpha1: [
        {
          default: false,
          lockToDefault: false,
          preRelease: FeatureStage.Alpha,
        },
      ],
      alpha2: [
        {
          default: false,
          lockToDefault: false,
          preRelease: FeatureStage.Alpha,
        },
      ],
      beta1: [
        { default: true, lockToDefault: false, preRelease: FeatureStage.Beta },
      ],
    });

    // Enable all alpha, disable all beta
    gate.setFromMap({ allAlpha: true, allBeta: false });
    expect(gate.enabled('alpha1')).toBe(true);
    expect(gate.enabled('alpha2')).toBe(true);
    expect(gate.enabled('beta1')).toBe(false);

    // Individual override should still win
    gate.setFromMap({ alpha1: false });
    expect(gate.enabled('alpha1')).toBe(false);
  });

  it('should parse comma-separated strings', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      feat1: [
        {
          default: false,
          lockToDefault: false,
          preRelease: FeatureStage.Alpha,
        },
      ],
      feat2: [
        { default: true, lockToDefault: false, preRelease: FeatureStage.Beta },
      ],
    });
    gate.set('feat1=true,feat2=false');
    expect(gate.enabled('feat1')).toBe(true);
    expect(gate.enabled('feat2')).toBe(false);
  });

  it('should handle case-insensitive boolean values in set', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      feat1: [
        {
          default: false,
          lockToDefault: false,
          preRelease: FeatureStage.Alpha,
        },
      ],
      feat2: [
        { default: true, lockToDefault: false, preRelease: FeatureStage.Beta },
      ],
    });
    gate.set('feat1=TRUE,feat2=FaLsE');
    expect(gate.enabled('feat1')).toBe(true);
    expect(gate.enabled('feat2')).toBe(false);
  });

  it('should ignore whitespace in set', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      feat1: [
        {
          default: false,
          lockToDefault: false,
          preRelease: FeatureStage.Alpha,
        },
      ],
    });
    gate.set(' feat1 = true ');
    expect(gate.enabled('feat1')).toBe(true);
  });

  it('should return default if feature is unknown', () => {
    const gate = DefaultFeatureGate.deepCopy();
    // unknownFeature is not added
    expect(gate.enabled('unknownFeature')).toBe(false);
  });

  it('should respect precedence: Lock > Override > Stage > Default', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      // Locked GA feature
      featLocked: [
        { default: true, lockToDefault: true, preRelease: FeatureStage.GA },
      ],
      // Alpha feature
      featAlpha: [
        {
          default: false,
          lockToDefault: false,
          preRelease: FeatureStage.Alpha,
        },
      ],
    });

    // 1. Lock wins over override
    gate.setFromMap({ featLocked: false });
    expect(gate.enabled('featLocked')).toBe(true);

    // 2. Override wins over Stage
    gate.setFromMap({ allAlpha: true, featAlpha: false });
    expect(gate.enabled('featAlpha')).toBe(false);

    // 3. Stage wins over Default
    gate.setFromMap({
      allAlpha: true,
      featAlpha: undefined as unknown as boolean,
    }); // Removing specific override effectively
    // Re-create to clear overrides map for cleaner test
    const gate2 = DefaultFeatureGate.deepCopy();
    gate2.add({
      featAlpha: [
        {
          default: false,
          lockToDefault: false,
          preRelease: FeatureStage.Alpha,
        },
      ],
    });
    gate2.setFromMap({ allAlpha: true });
    expect(gate2.enabled('featAlpha')).toBe(true);
  });

  it('should use the latest feature spec', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      evolvedFeat: [
        {
          default: false,
          lockToDefault: false,
          preRelease: FeatureStage.Alpha,
          since: '1.0',
        },
        {
          default: true,
          lockToDefault: false,
          preRelease: FeatureStage.Beta,
          since: '1.1',
        },
      ],
    });
    // Should use the last spec (Beta, default true)
    expect(gate.enabled('evolvedFeat')).toBe(true);
  });

  it('should log warning when using deprecated feature only once', () => {
    const warnSpy = vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      deprecatedFeat: [
        {
          default: false,
          lockToDefault: false,
          preRelease: FeatureStage.Deprecated,
        },
      ],
    });

    gate.setFromMap({ deprecatedFeat: true });
    expect(gate.enabled('deprecatedFeat')).toBe(true);
    expect(gate.enabled('deprecatedFeat')).toBe(true); // Call again

    // Should only be called once
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Feature "deprecatedFeat" is deprecated'),
    );
    warnSpy.mockRestore();
  });

  it('should perform deep copy of specs', () => {
    const gate = DefaultFeatureGate.deepCopy();
    const featKey = 'copiedFeat';
    const initialSpecs = [{ preRelease: FeatureStage.Alpha }];
    gate.add({ [featKey]: initialSpecs });

    const copy = gate.deepCopy();

    // Modifying original spec array should not affect copy if it was truly deep copied
    // (though our implementation clones the array, not the spec objects, which is usually enough for this use case)
    gate.add({
      [featKey]: [{ preRelease: FeatureStage.Beta }],
    });

    expect(gate.enabled(featKey)).toBe(true); // Beta (default true)
    expect(copy.enabled(featKey)).toBe(false); // Alpha (default false)
  });
});
