/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { IdeIntegrationNudge } from '../IdeIntegrationNudge.js';
import { LoopDetectionConfirmation } from './LoopDetectionConfirmation.js';
import { FolderTrustDialog } from './FolderTrustDialog.js';
import { ConsentPrompt } from './ConsentPrompt.js';
import { ThemeDialog } from './ThemeDialog.js';
import { SettingsDialog } from './SettingsDialog.js';
import { AuthInProgress } from '../auth/AuthInProgress.js';
import { AuthDialog } from '../auth/AuthDialog.js';
import { ApiAuthDialog } from '../auth/ApiAuthDialog.js';
import { EditorSettingsDialog } from './EditorSettingsDialog.js';
import { PrivacyNotice } from '../privacy/PrivacyNotice.js';
import { ProQuotaDialog } from './ProQuotaDialog.js';
import { ValidationDialog } from './ValidationDialog.js';
import { runExitCleanup } from '../../utils/cleanup.js';
import { RELAUNCH_EXIT_CODE } from '../../utils/processUtils.js';
import { SessionBrowser } from './SessionBrowser.js';
import { PermissionsModifyTrustDialog } from './PermissionsModifyTrustDialog.js';
import { ModelDialog } from './ModelDialog.js';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import process from 'node:process';
import { type UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
import { AdminSettingsChangedDialog } from './AdminSettingsChangedDialog.js';
import { IdeTrustChangeDialog } from './IdeTrustChangeDialog.js';
import { NewAgentsNotification } from './NewAgentsNotification.js';
import { AgentConfigDialog } from './AgentConfigDialog.js';
import { SessionRetentionWarningDialog } from './SessionRetentionWarningDialog.js';
import { useCallback } from 'react';
import { SettingScope } from '../../config/settings.js';
import { PolicyUpdateDialog } from './PolicyUpdateDialog.js';

interface DialogManagerProps {
  addItem: UseHistoryManagerReturn['addItem'];
  terminalWidth: number;
}

// Props for DialogManager
export const DialogManager = ({
  addItem,
  terminalWidth,
}: DialogManagerProps) => {
  const config = useConfig();
  const settings = useSettings();

  const uiState = useUIState();
  const uiActions = useUIActions();
  const {
    constrainHeight,
    terminalHeight,
    staticExtraHeight,
    terminalWidth: uiTerminalWidth,
    shouldShowRetentionWarning,
    sessionsToDeleteCount,
  } = uiState;

  const handleKeep120Days = useCallback(() => {
    settings.setValue(
      SettingScope.User,
      'general.sessionRetention.warningAcknowledged',
      true,
    );
    settings.setValue(
      SettingScope.User,
      'general.sessionRetention.enabled',
      true,
    );
    settings.setValue(
      SettingScope.User,
      'general.sessionRetention.maxAge',
      '120d',
    );
  }, [settings]);

  const handleKeep30Days = useCallback(() => {
    settings.setValue(
      SettingScope.User,
      'general.sessionRetention.warningAcknowledged',
      true,
    );
    settings.setValue(
      SettingScope.User,
      'general.sessionRetention.enabled',
      true,
    );
    settings.setValue(
      SettingScope.User,
      'general.sessionRetention.maxAge',
      '30d',
    );
  }, [settings]);

  if (shouldShowRetentionWarning && sessionsToDeleteCount !== undefined) {
    return (
      <SessionRetentionWarningDialog
        onKeep120Days={handleKeep120Days}
        onKeep30Days={handleKeep30Days}
        sessionsToDeleteCount={sessionsToDeleteCount ?? 0}
      />
    );
  }

  if (uiState.adminSettingsChanged) {
    return <AdminSettingsChangedDialog />;
  }
  if (uiState.showIdeRestartPrompt) {
    return <IdeTrustChangeDialog reason={uiState.ideTrustRestartReason} />;
  }
  if (uiState.newAgents) {
    return (
      <NewAgentsNotification
        agents={uiState.newAgents}
        onSelect={uiActions.handleNewAgentsSelect}
      />
    );
  }
  if (uiState.quota.proQuotaRequest) {
    return (
      <ProQuotaDialog
        failedModel={uiState.quota.proQuotaRequest.failedModel}
        fallbackModel={uiState.quota.proQuotaRequest.fallbackModel}
        message={uiState.quota.proQuotaRequest.message}
        isTerminalQuotaError={
          uiState.quota.proQuotaRequest.isTerminalQuotaError
        }
        isModelNotFoundError={
          !!uiState.quota.proQuotaRequest.isModelNotFoundError
        }
        onChoice={uiActions.handleProQuotaChoice}
      />
    );
  }
  if (uiState.quota.validationRequest) {
    return (
      <ValidationDialog
        validationLink={uiState.quota.validationRequest.validationLink}
        validationDescription={
          uiState.quota.validationRequest.validationDescription
        }
        learnMoreUrl={uiState.quota.validationRequest.learnMoreUrl}
        onChoice={uiActions.handleValidationChoice}
      />
    );
  }
  if (uiState.shouldShowIdePrompt) {
    return (
      <IdeIntegrationNudge
        ide={uiState.currentIDE!}
        onComplete={uiActions.handleIdePromptComplete}
      />
    );
  }
  if (uiState.isFolderTrustDialogOpen) {
    return (
      <FolderTrustDialog
        onSelect={uiActions.handleFolderTrustSelect}
        isRestarting={uiState.isRestarting}
        discoveryResults={uiState.folderDiscoveryResults}
      />
    );
  }
  if (uiState.isPolicyUpdateDialogOpen) {
    return (
      <PolicyUpdateDialog
        config={config}
        request={uiState.policyUpdateConfirmationRequest!}
        onClose={() => uiActions.setIsPolicyUpdateDialogOpen(false)}
      />
    );
  }
  if (uiState.loopDetectionConfirmationRequest) {
    return (
      <LoopDetectionConfirmation
        onComplete={uiState.loopDetectionConfirmationRequest.onComplete}
      />
    );
  }

  if (uiState.permissionConfirmationRequest) {
    const files = uiState.permissionConfirmationRequest.files;
    const filesList = files.map((f) => `- ${f}`).join('\n');
    return (
      <ConsentPrompt
        prompt={`The following files are outside your workspace:\n\n${filesList}\n\nDo you want to allow this read?`}
        onConfirm={(allowed) => {
          uiState.permissionConfirmationRequest?.onComplete({ allowed });
        }}
        terminalWidth={terminalWidth}
      />
    );
  }

  // commandConfirmationRequest and authConsentRequest are kept separate
  // to avoid focus deadlocks and state race conditions between the
  // synchronous command loop and the asynchronous auth flow.
  if (uiState.commandConfirmationRequest) {
    return (
      <ConsentPrompt
        prompt={uiState.commandConfirmationRequest.prompt}
        onConfirm={uiState.commandConfirmationRequest.onConfirm}
        terminalWidth={terminalWidth}
      />
    );
  }
  if (uiState.authConsentRequest) {
    return (
      <ConsentPrompt
        prompt={uiState.authConsentRequest.prompt}
        onConfirm={uiState.authConsentRequest.onConfirm}
        terminalWidth={terminalWidth}
      />
    );
  }
  if (uiState.confirmUpdateExtensionRequests.length > 0) {
    const request = uiState.confirmUpdateExtensionRequests[0];
    return (
      <ConsentPrompt
        prompt={request.prompt}
        onConfirm={request.onConfirm}
        terminalWidth={terminalWidth}
      />
    );
  }
  if (uiState.isThemeDialogOpen) {
    return (
      <Box flexDirection="column">
        {uiState.themeError && (
          <Box marginBottom={1}>
            <Text color={theme.status.error}>{uiState.themeError}</Text>
          </Box>
        )}
        <ThemeDialog
          onSelect={uiActions.handleThemeSelect}
          onCancel={uiActions.closeThemeDialog}
          onHighlight={uiActions.handleThemeHighlight}
          settings={settings}
          availableTerminalHeight={
            constrainHeight ? terminalHeight - staticExtraHeight : undefined
          }
          terminalWidth={uiTerminalWidth}
        />
      </Box>
    );
  }
  if (uiState.isSettingsDialogOpen) {
    return (
      <Box flexDirection="column">
        <SettingsDialog
          settings={settings}
          onSelect={() => uiActions.closeSettingsDialog()}
          onRestartRequest={async () => {
            await runExitCleanup();
            process.exit(RELAUNCH_EXIT_CODE);
          }}
          availableTerminalHeight={terminalHeight - staticExtraHeight}
          config={config}
        />
      </Box>
    );
  }
  if (uiState.isModelDialogOpen) {
    return <ModelDialog onClose={uiActions.closeModelDialog} />;
  }
  if (
    uiState.isAgentConfigDialogOpen &&
    uiState.selectedAgentName &&
    uiState.selectedAgentDisplayName &&
    uiState.selectedAgentDefinition
  ) {
    return (
      <Box flexDirection="column">
        <AgentConfigDialog
          agentName={uiState.selectedAgentName}
          displayName={uiState.selectedAgentDisplayName}
          definition={uiState.selectedAgentDefinition}
          settings={settings}
          onClose={uiActions.closeAgentConfigDialog}
          onSave={async () => {
            // Reload agent registry to pick up changes
            const agentRegistry = config?.getAgentRegistry();
            if (agentRegistry) {
              await agentRegistry.reload();
            }
          }}
        />
      </Box>
    );
  }
  if (uiState.isAuthenticating) {
    return (
      <AuthInProgress
        onTimeout={() => {
          uiActions.onAuthError('Authentication cancelled.');
        }}
      />
    );
  }
  if (uiState.isAwaitingApiKeyInput) {
    return (
      <Box flexDirection="column">
        <ApiAuthDialog
          key={uiState.apiKeyDefaultValue}
          onSubmit={uiActions.handleApiKeySubmit}
          onCancel={uiActions.handleApiKeyCancel}
          error={uiState.authError}
          defaultValue={uiState.apiKeyDefaultValue}
        />
      </Box>
    );
  }
  if (uiState.isAuthDialogOpen) {
    return (
      <Box flexDirection="column">
        <AuthDialog
          config={config}
          settings={settings}
          setAuthState={uiActions.setAuthState}
          authError={uiState.authError}
          onAuthError={uiActions.onAuthError}
          setAuthContext={uiActions.setAuthContext}
        />
      </Box>
    );
  }
  if (uiState.isEditorDialogOpen) {
    return (
      <Box flexDirection="column">
        {uiState.editorError && (
          <Box marginBottom={1}>
            <Text color={theme.status.error}>{uiState.editorError}</Text>
          </Box>
        )}
        <EditorSettingsDialog
          onSelect={uiActions.handleEditorSelect}
          settings={settings}
          onExit={uiActions.exitEditorDialog}
        />
      </Box>
    );
  }
  if (uiState.showPrivacyNotice) {
    return (
      <PrivacyNotice
        onExit={() => uiActions.exitPrivacyNotice()}
        config={config}
      />
    );
  }
  if (uiState.isSessionBrowserOpen) {
    return (
      <SessionBrowser
        config={config}
        onResumeSession={uiActions.handleResumeSession}
        onDeleteSession={uiActions.handleDeleteSession}
        onExit={uiActions.closeSessionBrowser}
      />
    );
  }

  if (uiState.isPermissionsDialogOpen) {
    return (
      <PermissionsModifyTrustDialog
        onExit={uiActions.closePermissionsDialog}
        addItem={addItem}
        targetDirectory={uiState.permissionsDialogProps?.targetDirectory}
      />
    );
  }

  return null;
};
