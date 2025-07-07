/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  type Config,
  ApprovalMode,
  getAllGeminiMdFilenames,
  getErrorMessage,
} from '@google/gemini-cli-core';
import { LoadedSettings } from '../../config/settings.js';
import { getCliVersion } from '../../utils/version.js';
import os from 'node:os';

export type ConnectivityStatus = 'pending' | 'success' | 'error';

export interface StatusInfo {
  // Basic Info
  cliVersion: string;
  osPlatform: string;
  model: string;

  // Connectivity
  connectivity: ConnectivityStatus;
  error: string | null;
  isComplete: boolean;

  // Paths
  projectRoot: string;
  targetDirectory: string;
  settingsFiles: string[];

  // Context & Memory
  contextFiles: string[];
  userMemorySize: number;
  mcpServerCount: number;

  // Key Settings
  authType: string;
  debugMode: boolean;
  approvalMode: ApprovalMode;
  checkpointing: boolean;
}

/**
 * Custom hook to get and manage CLI status, including version, paths,
 * key settings, and connectivity.
 */
export const useStatusCheck = (
  config: Config,
  settings: LoadedSettings,
  enabled: boolean,
): StatusInfo => {
  const [connectivity, setConnectivity] =
    useState<ConnectivityStatus>('pending');
  const [error, setError] = useState<string | null>(null);
  const [cliVersion, setCliVersion] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getCliVersion()
      .then((version) => {
        if (isMounted) {
          setCliVersion(version);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCliVersion('unknown');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setConnectivity('pending');
    setError(null);
    setIsComplete(false);

    if (!enabled) {
      return;
    }

    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const checkConnectivity = async () => {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(new Error('Connectivity check timed out after 10 seconds.')),
          10000,
        );
      });

      try {
        const client = config.getGeminiClient();
        if (client) {
          await Promise.race([client.checkConnectivity(), timeoutPromise]);
          if (isMounted) {
            setConnectivity('success');
          }
        } else {
          throw new Error('Gemini client not initialized.');
        }
      } catch (e) {
        if (isMounted) {
          setConnectivity('error');
          try {
            setError(getErrorMessage(e));
          } catch (_) {
            setError('A complex error occurred that could not be displayed.');
          }
        }
      } finally {
        clearTimeout(timeoutId);
        if (isMounted) {
          setIsComplete(true);
        }
      }
    };

    checkConnectivity();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [config, settings, enabled]);

  // Gather all the required information.
  const contextFileNames = (() => {
    const fromSettings = settings.merged.contextFileName;
    if (fromSettings) {
      return Array.isArray(fromSettings) ? fromSettings : [fromSettings];
    }
    return getAllGeminiMdFilenames();
  })();

  const loadedSettingsFiles = [];
  if (Object.keys(settings.user.settings).length > 0) {
    loadedSettingsFiles.push(settings.user.path);
  }
  if (Object.keys(settings.workspace.settings).length > 0) {
    loadedSettingsFiles.push(settings.workspace.path);
  }

  return {
    // Basic Info
    cliVersion,
    osPlatform: os.platform(),
    model: config.getModel(),

    // Connectivity
    connectivity,
    error,
    isComplete,

    // Paths
    projectRoot: config.getProjectRoot() || 'N/A',
    targetDirectory: config.getTargetDir(),
    settingsFiles: loadedSettingsFiles,

    // Context & Memory
    contextFiles: contextFileNames,
    userMemorySize: config.getUserMemory().length,
    mcpServerCount: Object.keys(config.getMcpServers() || {}).length,

    // Key Settings
    authType: settings.merged.selectedAuthType || 'Not set',
    debugMode: config.getDebugMode(),
    approvalMode: config.getApprovalMode(),
    checkpointing: config.getCheckpointingEnabled(),
  };
};
