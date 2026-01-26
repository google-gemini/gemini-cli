/**
 * @license
 * Copyright 2025 Google LLC
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
  } = uiState;

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
  if (uiState.proQuotaRequest) {
    return (
      <ProQuotaDialog
        failedModel={uiState.proQuotaRequest.failedModel}
        fallbackModel={uiState.proQuotaRequest.fallbackModel}
        message={uiState.proQuotaRequest.message}
        isTerminalQuotaError={uiState.proQuotaRequest.isTerminalQuotaError}
        isModelNotFoundError={!!uiState.proQuotaRequest.isModelNotFoundError}
        onChoice={uiActions.handleProQuotaChoice}
      />
    );
  }
  if (uiState.validationRequest) {
    return (
      <ValidationDialog
        validationLink={uiState.validationRequest.validationLink}
        validationDescription={uiState.validationRequest.validationDescription}
        learnMoreUrl={uiState.validationRequest.learnMoreUrl}
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
  if (uiState.confirmationRequest) {
    return (
      <ConsentPrompt
        prompt={uiState.confirmationRequest.prompt}
        onConfirm={uiState.confirmationRequest.onConfirm}
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
