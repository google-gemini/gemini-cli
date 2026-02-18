/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType, type HistoryItemFeaturesList } from '../types.js';
import { FeatureStage } from '@google/gemini-cli-core';

export const featuresCommand: SlashCommand = {
  name: 'features',
  altNames: ['feature'],
  description: 'List alpha, beta, and deprecated Gemini CLI features.',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext): Promise<void> => {
    const featureGate = context.services.config?.getFeatureGate();
    if (!featureGate) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Could not retrieve feature gate.',
      });
      return;
    }

    const allFeatures = featureGate.getFeatureInfo();
    const filteredFeatures = allFeatures.filter(
      (f) =>
        f.stage === FeatureStage.Alpha ||
        f.stage === FeatureStage.Beta ||
        f.stage === FeatureStage.Deprecated,
    );

    const featuresListItem: HistoryItemFeaturesList = {
      type: MessageType.FEATURES_LIST,
      features: filteredFeatures,
    };

    context.ui.addItem(featuresListItem);
  },
};
