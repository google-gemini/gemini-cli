/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Text } from 'ink';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getNotificationSettings,
  setGlobalNotificationsEnabled,
  updateNotificationEventSettings,
} from '../../../notifications/manager.js';
import { type LoadedSettings } from '../../../config/settings.js';
import type { NotificationEventType } from '../../../notifications/types.js';
import { Global } from './setup/Global.js';
import { Event } from './setup/Event.js';
import { CustomPath } from './setup/CustomPath.js';
import { SoundWarning } from './setup/SoundWarning.js';

const getSystemSoundPath = (
  eventType: NotificationEventType,
): string | undefined => {
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
      return undefined;
    default:
      return undefined;
  }
};

interface NotificationsSetupProps {
  settings: LoadedSettings;
  onComplete: () => void;
}

export const NotificationsSetup: React.FC<NotificationsSetupProps> = ({
  settings,
  onComplete,
}) => {
  const [_currentSettings, setCurrentSettings] = useState(
    getNotificationSettings(),
  );
  const [step, setStep] = useState('global');
  const [currentEventType, setCurrentEventType] =
    useState<NotificationEventType | null>(null); // To keep track of which event triggered the warning
  const [customPathError, setCustomPathError] = useState<string | null>(null);

  const advanceStep = (currentStep: NotificationEventType | 'global') => {
    const orderedEventTypes: Array<NotificationEventType | 'global'> = [
      'global',
      'inputRequired',
      'taskComplete',
      'idleAlert',
    ];
    const currentIndex = orderedEventTypes.indexOf(currentStep);
    if (currentIndex !== -1 && currentIndex < orderedEventTypes.length - 1) {
      setStep(orderedEventTypes[currentIndex + 1]);
    } else {
      setStep('done');
      onComplete();
    }
  };

  const handleGlobalEnable = (value: boolean) => {
    setGlobalNotificationsEnabled(value, settings);
    setCurrentSettings(getNotificationSettings());
    if (value) {
      advanceStep('global');
    } else {
      onComplete();
    }
  };

  const handleEventEnable = (
    eventType: NotificationEventType,
    value: boolean,
  ) => {
    updateNotificationEventSettings(eventType, { enabled: value }, settings);
    setCurrentSettings(getNotificationSettings());

    if (value && os.platform() !== 'win32') {
      const systemSoundPath = getSystemSoundPath(eventType);
      if (systemSoundPath && !fs.existsSync(systemSoundPath)) {
        setCurrentEventType(eventType);
        setStep('soundWarning');
        return;
      }
    }
    advanceStep(eventType);
  };

  const handleSoundWarningResponse = (
    response: 'disable' | 'custom' | 'continue',
  ) => {
    if (!currentEventType) return;

    if (response === 'disable') {
      updateNotificationEventSettings(
        currentEventType,
        { enabled: false },
        settings,
      );
      setCurrentSettings(getNotificationSettings());
      advanceStep(currentEventType);
    } else if (response === 'custom') {
      setStep('customSoundPath');
    } else {
      advanceStep(currentEventType);
    }
  };

  const handleCustomSoundPath = (rawPath: string) => {
    if (!currentEventType) return;

    const resolvedPath = rawPath.startsWith('~')
      ? path.join(os.homedir(), rawPath.slice(1))
      : path.resolve(rawPath);

    if (!fs.existsSync(resolvedPath)) {
      setCustomPathError(`File not found: ${resolvedPath}`);
      return;
    }
    setCustomPathError(null);

    updateNotificationEventSettings(
      currentEventType,
      { sound: 'custom', customPath: resolvedPath },
      settings,
    );
    setCurrentSettings(getNotificationSettings());
    advanceStep(currentEventType);
  };

  if (step === 'done') {
    return <Text>Notification setup complete!</Text>;
  }

  if (step === 'global') {
    return <Global onSelect={handleGlobalEnable} />;
  }

  if (step === 'soundWarning' && currentEventType) {
    return (
      <SoundWarning
        eventType={currentEventType}
        soundPath={getSystemSoundPath(currentEventType)!}
        onSelect={handleSoundWarningResponse}
      />
    );
  }

  if (step === 'customSoundPath' && currentEventType) {
    return (
      <CustomPath
        eventType={currentEventType}
        onSubmit={handleCustomSoundPath}
        error={customPathError}
      />
    );
  }

  if (
    step === 'inputRequired' ||
    step === 'taskComplete' ||
    step === 'idleAlert'
  ) {
    const eventType = step as NotificationEventType;
    return (
      <Event
        eventType={eventType}
        onSelect={(value) => handleEventEnable(eventType, value)}
      />
    );
  }

  return null;
};
