/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { type FeatureInfo } from '../../types.js';
import { FeatureStage } from '@google/gemini-cli-core';

interface FeaturesListProps {
  features: FeatureInfo[];
}

export const FeaturesList: React.FC<FeaturesListProps> = ({ features }) => {
  if (features.length === 0) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color={theme.text.primary}> No features found</Text>
      </Box>
    );
  }

  const alphaFeatures = features.filter((f) => f.stage === FeatureStage.Alpha);
  const betaFeatures = features.filter((f) => f.stage === FeatureStage.Beta);
  const deprecatedFeatures = features.filter(
    (f) => f.stage === FeatureStage.Deprecated,
  );

  // Column widths as percentages/proportions
  const colWidths = {
    feature: '40%',
    status: '20%',
    since: '20%',
    until: '20%',
  };

  const renderSection = (
    title: string,
    sectionFeatures: FeatureInfo[],
    stageColor: string,
  ) => {
    if (sectionFeatures.length === 0) return null;

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box flexDirection="row" marginBottom={1}>
          <Text bold color={stageColor}>
            ┃
          </Text>
          <Box marginLeft={1}>
            <Text bold color={theme.text.primary}>
              {title}
            </Text>
            <Text color={theme.text.secondary}>
              {' '}
              ({sectionFeatures.length})
            </Text>
          </Box>
        </Box>

        {/* Table Header */}
        <Box
          flexDirection="row"
          paddingX={1}
          borderStyle="single"
          borderTop={true}
          borderBottom={true}
          borderLeft={false}
          borderRight={false}
          borderColor={theme.border.default}
        >
          <Box width={colWidths.feature}>
            <Text bold color={theme.text.secondary}>
              FEATURE
            </Text>
          </Box>
          <Box width={colWidths.status}>
            <Text bold color={theme.text.secondary}>
              STATUS
            </Text>
          </Box>
          <Box width={colWidths.since}>
            <Text bold color={theme.text.secondary}>
              SINCE
            </Text>
          </Box>
          <Box width={colWidths.until}>
            <Text bold color={theme.text.secondary}>
              UNTIL
            </Text>
          </Box>
        </Box>

        {/* Table Rows */}
        {sectionFeatures.map((feature) => (
          <Box
            key={feature.key}
            flexDirection="column"
            paddingX={1}
            paddingTop={1}
          >
            <Box flexDirection="row">
              <Box width={colWidths.feature}>
                <Text bold color={theme.text.accent}>
                  {feature.key}
                </Text>
              </Box>
              <Box width={colWidths.status}>
                <Box flexDirection="row">
                  <Text>{feature.enabled ? '🟢 ' : '🔴 '}</Text>
                  <Text
                    color={
                      feature.enabled
                        ? theme.status.success
                        : theme.status.error
                    }
                  >
                    {feature.enabled ? 'Enabled' : 'Disabled'}
                  </Text>
                </Box>
              </Box>
              <Box width={colWidths.since}>
                <Text color={theme.text.secondary}>{feature.since || '—'}</Text>
              </Box>
              <Box width={colWidths.until}>
                <Text color={theme.text.secondary}>{feature.until || '—'}</Text>
              </Box>
            </Box>
            {feature.description && (
              <Box marginLeft={2}>
                <Text dimColor color={theme.text.primary}>
                  {feature.description}
                </Text>
              </Box>
            )}
            {feature.issueUrl && (
              <Box marginLeft={2} marginBottom={1}>
                <Text color={theme.text.accent}>
                  Tracker: <Text dimColor>{feature.issueUrl}</Text>
                </Text>
              </Box>
            )}
            {!feature.issueUrl && feature.description && (
              <Box marginBottom={1} />
            )}
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      {renderSection('Alpha Features', alphaFeatures, theme.status.error)}
      {renderSection('Beta Features', betaFeatures, theme.status.warning)}
      {renderSection(
        'Deprecated Features',
        deprecatedFeatures,
        theme.text.secondary,
      )}

      <Box flexDirection="row" marginTop={1} paddingX={1}>
        <Text color={theme.text.secondary}>
          💡 Use{' '}
          <Text bold color={theme.text.accent}>
            /settings
          </Text>{' '}
          to enable or disable features. You can also use stage toggles like{' '}
          <Text bold color={theme.text.accent}>
            allAlpha=true
          </Text>{' '}
          or{' '}
          <Text bold color={theme.text.accent}>
            allBeta=false
          </Text>{' '}
          to toggle entire stages.
        </Text>
      </Box>
    </Box>
  );
};
