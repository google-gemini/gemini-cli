/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { FeaturesList } from './FeaturesList.js';
import { type FeatureInfo } from '../../types.js';
import { FeatureStage } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../../test-utils/render.js';

const mockFeatures: FeatureInfo[] = [
  {
    key: 'alphaFeat',
    enabled: false,
    stage: FeatureStage.Alpha,
    since: '0.30.0',
    description: 'An alpha feature.',
  },
  {
    key: 'betaFeat',
    enabled: true,
    stage: FeatureStage.Beta,
    since: '0.29.0',
    description: 'A beta feature.',
  },
  {
    key: 'deprecatedFeat',
    enabled: false,
    stage: FeatureStage.Deprecated,
    since: '0.28.0',
    until: '0.31.0',
    description: 'A deprecated feature.',
  },
];

describe('<FeaturesList />', () => {
  it('renders correctly with features', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <FeaturesList features={mockFeatures} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with no features', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <FeaturesList features={[]} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });
});
