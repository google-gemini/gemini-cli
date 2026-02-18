/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, type vi } from 'vitest';
import { featuresCommand } from './featuresCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType, type HistoryItemFeaturesList } from '../types.js';
import { FeatureStage } from '@google/gemini-cli-core';

describe('featuresCommand', () => {
  it('should display an error if the feature gate is unavailable', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: {
          getFeatureGate: () => undefined,
        },
      },
    });

    if (!featuresCommand.action) throw new Error('Action not defined');
    await featuresCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.ERROR,
      text: 'Could not retrieve feature gate.',
    });
  });

  it('should list alpha, beta, and deprecated features', async () => {
    const mockFeatures = [
      { key: 'alphaFeat', enabled: false, stage: FeatureStage.Alpha },
      { key: 'betaFeat', enabled: true, stage: FeatureStage.Beta },
      { key: 'deprecatedFeat', enabled: false, stage: FeatureStage.Deprecated },
      { key: 'gaFeat', enabled: true, stage: FeatureStage.GA },
    ];

    const mockContext = createMockCommandContext({
      services: {
        config: {
          getFeatureGate: () => ({
            getFeatureInfo: () => mockFeatures,
          }),
        },
      },
    });

    if (!featuresCommand.action) throw new Error('Action not defined');
    await featuresCommand.action(mockContext, '');

    const [message] = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const featuresList = message as HistoryItemFeaturesList;
    expect(featuresList.type).toBe(MessageType.FEATURES_LIST);
    expect(featuresList.features).toHaveLength(3);
    expect(featuresList.features.map((f) => f.key)).toEqual([
      'alphaFeat',
      'betaFeat',
      'deprecatedFeat',
    ]);
  });
});
