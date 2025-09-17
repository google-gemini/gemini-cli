/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import * as os from 'os';
import * as fs from 'fs';
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

const getSystemSoundPath = (eventType: NotificationEventType): string | undefined => {
  switch (os.platform()) {
    case 'darwin':
      return eventType === 'inputRequired'
        ? '/System/Library/Sounds/Glass.aiff'
        : '/System/Library/Sounds/Pop.aiff';
    case 'linux':
      return eventType === 'inputRequired'
        ? '/usr/share/sounds/freedesktop/stereo/dialog-warning.oga'
        : '/usr/share/sounds/freedesktop/stereo/message.oga';
    case 'win32':
      // Windows system sounds are not file paths, they are aliases
      return undefined;
    default:
      return undefined;
  }
};

interface NotificationsSetupProps {
  config: Config;
  onComplete: () => void;
}

export const NotificationsSetup: React.FC<NotificationsSetupProps> = ({ config, onComplete }) => {
  const [settings, setSettings] = useState(getNotificationSettings());
  const [step, setStep] = useState('global'); // 'global', 'inputRequired', 'taskComplete', 'idleAlert', 'done', 'soundWarning'
  const [currentEventType, setCurrentEventType] = useState<NotificationEventType | null>(null); // To keep track of which event triggered the warning

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

    if (value && os.platform() !== 'win32') { // Only check for non-Windows OS
      const systemSoundPath = getSystemSoundPath(eventType);
      if (systemSoundPath && !fs.existsSync(systemSoundPath)) {
        setCurrentEventType(eventType);
        setStep('soundWarning');
        return; // Stop here and show warning
      }
    }

    const orderedEventTypes: NotificationEventType[] = ['inputRequired', 'taskComplete', 'idleAlert'];
    const currentIndex = orderedEventTypes.indexOf(eventType as NotificationEventType);
    if (currentIndex !== -1 && currentIndex < orderedEventTypes.length - 1) {
      setStep(orderedEventTypes[currentIndex + 1]);
    } else {
      setStep('done');
      onComplete();
    }
  };

  const handleSoundWarningResponse = (response: 'disable' | 'custom' | 'continue') => {
    if (!currentEventType) return;

    if (response === 'disable') {
      updateNotificationEventSettings(currentEventType, { enabled: false }, config);
      const newSettings = { ...settings };
      newSettings.events[currentEventType].enabled = false;
      setSettings(newSettings);
    } else if (response === 'custom') {
      // TODO: Implement custom sound path input
      console.log('Custom sound path input not yet implemented.');
    }

    // Move to the next step after handling the warning
    const orderedEventTypes: NotificationEventType[] = ['inputRequired', 'taskComplete', 'idleAlert'];
    const currentIndex = orderedEventTypes.indexOf(currentEventType);
    if (currentIndex !== -1 && currentIndex < orderedEventTypes.length - 1) {
      setStep(orderedEventTypes[currentIndex + 1]);
    } else {
      setStep('done');
      onComplete();
    }
    setCurrentEventType(null); // Clear the current event type
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

  if (step === 'soundWarning') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="red">Warning: System Sound Not Found!</Text>
        <Box marginTop={1}>
          <Text>The default system sound for "{currentEventType}" was not found on your system:</Text>
          <Text>{getSystemSoundPath(currentEventType!)}</Text>
        </Box>
        <Box marginTop={1}>
          <Text>What would you like to do?</Text>
        </Box>
        <RadioButtonSelect
          items={[
            { label: 'Disable this notification', value: 'disable' },
            { label: 'Use a custom sound (not yet implemented)', value: 'custom' },
            { label: 'Continue anyway (notification might not play)', value: 'continue' },
          ]}
          onSelect={handleSoundWarningResponse}
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
