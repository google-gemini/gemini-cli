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

    gate.setFromMap({ autoLockedGA: false, autoUnlockedAlpha: true });

    expect(gate.enabled('autoLockedGA')).toBe(true);
    expect(gate.enabled('autoUnlockedAlpha')).toBe(true);
  });

  it('should keep locked Alpha feature disabled by default', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      lockedAlpha: [{ preRelease: FeatureStage.Alpha, lockToDefault: true }],
    });

    gate.setFromMap({ lockedAlpha: true });

    expect(gate.enabled('lockedAlpha')).toBe(false);
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
    gate.setFromMap({ testGA: false });
    expect(gate.enabled('testGA')).toBe(true);
  });

  it('should return feature info with metadata', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      feat1: [
        {
          preRelease: FeatureStage.Alpha,
          since: '0.1.0',
          description: 'Feature 1',
        },
      ],
      feat2: [
        {
          preRelease: FeatureStage.Beta,
          since: '0.2.0',
          until: '0.3.0',
          description: 'Feature 2',
        },
      ],
    });

    const info = gate.getFeatureInfo();
    const feat1 = info.find((f) => f.key === 'feat1');
    const feat2 = info.find((f) => f.key === 'feat2');

    expect(feat1).toEqual({
      key: 'feat1',
      enabled: false,
      stage: FeatureStage.Alpha,
      since: '0.1.0',
      until: undefined,
      description: 'Feature 1',
      issueUrl: undefined,
    });
    expect(feat2).toEqual({
      key: 'feat2',
      enabled: true,
      stage: FeatureStage.Beta,
      since: '0.2.0',
      until: '0.3.0',
      description: 'Feature 2',
      issueUrl: undefined,
    });
  });

  it('should include issueUrl in feature info', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      featWithUrl: [
        {
          preRelease: FeatureStage.Alpha,
          issueUrl: 'https://github.com/google/gemini-cli/issues/1',
        },
      ],
    });

    const info = gate.getFeatureInfo();
    const feat = info.find((f) => f.key === 'featWithUrl');

    expect(feat).toMatchObject({
      key: 'featWithUrl',
      issueUrl: 'https://github.com/google/gemini-cli/issues/1',
    });
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

    gate.setFromMap({ allAlpha: true, allBeta: false });
    expect(gate.enabled('alpha1')).toBe(true);
    expect(gate.enabled('alpha2')).toBe(true);
    expect(gate.enabled('beta1')).toBe(false);

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
    expect(gate.enabled('unknownFeature')).toBe(false);
  });

  it('should respect precedence: Lock > Override > Stage > Default', () => {
    const gate = DefaultFeatureGate.deepCopy();
    gate.add({
      featLocked: [
        { default: true, lockToDefault: true, preRelease: FeatureStage.GA },
      ],
      featAlpha: [
        {
          default: false,
          lockToDefault: false,
          preRelease: FeatureStage.Alpha,
        },
      ],
    });

    gate.setFromMap({ featLocked: false });
    expect(gate.enabled('featLocked')).toBe(true);

    gate.setFromMap({ allAlpha: true, featAlpha: false });
    expect(gate.enabled('featAlpha')).toBe(false);

    gate.setFromMap({
      allAlpha: true,
      featAlpha: undefined as unknown as boolean,
    });
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
    expect(gate.enabled('deprecatedFeat')).toBe(true);

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

    gate.add({
      [featKey]: [{ preRelease: FeatureStage.Beta }],
    });

    expect(gate.enabled(featKey)).toBe(true);
    expect(copy.enabled(featKey)).toBe(false);
  });
});
