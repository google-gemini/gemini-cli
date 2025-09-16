/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import {
  RadioButtonSelect,
  RadioSelectItem,
} from '../shared/RadioButtonSelect.js';
import {
  getNotificationSettings,
  setGlobalNotificationsEnabled,
  updateNotificationEventSettings,
} from '../../../notifications/manager.js';
import { Config } from '@google/gemini-cli-core';
import { NotificationEventType } from '../../../notifications/types.js';

interface NotificationsSetupProps {
  config: Config;
  onComplete: () => void;
}

export const NotificationsSetup: React.FC<NotificationsSetupProps> = ({ config, onComplete }) => {
  const [settings, setSettings] = useState(getNotificationSettings());
  const [step, setStep] = useState('global'); // 'global', 'inputRequired', 'taskComplete', 'idleAlert', 'done'

  const handleGlobalEnable = (value: boolean) => {
    setGlobalNotificationsEnabled(value, config);
    setSettings({ ...settings, enabled: value });
    if (value) {
      setStep('inputRequired');
    } else {
      onComplete();
    }
  };

  const handleEventEnable = (eventType: NotificationEventType, value: boolean) => {
    updateNotificationEventSettings(eventType, { enabled: value }, config);
    const newSettings = { ...settings };
    newSettings.events[eventType].enabled = value;
    setSettings(newSettings);
    const orderedEventTypes: NotificationEventType[] = ['inputRequired', 'taskComplete', 'idleAlert'];
    const currentIndex = orderedEventTypes.indexOf(eventType as NotificationEventType);
    if (currentIndex !== -1 && currentIndex < orderedEventTypes.length - 1) {
      setStep(orderedEventTypes[currentIndex + 1]);
    } else {
      setStep('done');
      onComplete();
    }
  };

  const globalOptions: Array<RadioSelectItem<boolean>> = [
    {
      label: 'Yes, enable audio notifications',
      value: true,
    },
    {
      label: 'No, disable audio notifications',
      value: false,
    },
  ];

  const eventOptions: Array<RadioSelectItem<boolean>> = [
    {
      label: 'Yes',
      value: true,
    },
    {
      label: 'No',
      value: false,
    },
  ];

  if (step === 'done') {
    return <Text>Notification setup complete!</Text>;
  }
  
  if (step === 'global') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Audio Notification Setup</Text>
        <Box marginTop={1}>
          <Text>Do you want to enable audio notifications?</Text>
        </Box>
        <RadioButtonSelect
          items={globalOptions}
          onSelect={handleGlobalEnable}
          isFocused
        />
      </Box>
    );
  }

  const eventType = step as NotificationEventType;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Audio Notification Setup</Text>
      <Box marginTop={1}>
        <Text>Enable notification for "{eventType}"?</Text>
      </Box>
      <RadioButtonSelect
        items={eventOptions}
        onSelect={(value) => handleEventEnable(eventType, value)}
        isFocused
      />
    </Box>
  );
};
