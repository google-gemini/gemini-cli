/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { type Config, AuthType } from '@google/gemini-cli-core';
import { GeminiPrivacyNotice } from './GeminiPrivacyNotice.js';
import { CloudPaidPrivacyNotice } from './CloudPaidPrivacyNotice.js';
import { CloudFreePrivacyNotice } from './CloudFreePrivacyNotice.js';
import { type LoadedSettings } from '../../config/settings.js';

interface PrivacyNoticeProps {
  onExit: () => void;
  config: Config;
  settings: LoadedSettings;
}

const PrivacyNoticeText = ({
  config,
  onExit,
  settings,
}: {
  config: Config;
  onExit: () => void;
  settings: LoadedSettings;
}) => {
  const authType = config.getContentGeneratorConfig()?.authType;

  switch (authType) {
    case AuthType.USE_GEMINI:
      return <GeminiPrivacyNotice onExit={onExit} />;
    case AuthType.USE_VERTEX_AI:
      return <CloudPaidPrivacyNotice onExit={onExit} />;
    case AuthType.LOGIN_WITH_GOOGLE_PERSONAL:
    default:
      return <CloudFreePrivacyNotice config={config} onExit={onExit} />;
  }
};

export const PrivacyNotice = ({ onExit, config, settings }: PrivacyNoticeProps) => (
  <Box borderStyle="round" padding={1} flexDirection="column">
    <PrivacyNoticeText config={config} onExit={onExit} settings={settings} />
  </Box>
);
