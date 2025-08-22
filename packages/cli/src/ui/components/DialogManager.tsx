/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { IdeIntegrationNudge } from '../IdeIntegrationNudge.js';
import { FolderTrustDialog } from './FolderTrustDialog.js';
import { ShellConfirmationDialog } from './ShellConfirmationDialog.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { ThemeDialog } from './ThemeDialog.js';
import { SettingsDialog } from './SettingsDialog.js';
import { AuthInProgress } from './AuthInProgress.js';
import { AuthDialog } from './AuthDialog.js';
import { EditorSettingsDialog } from './EditorSettingsDialog.js';
import { PrivacyNotice } from '../privacy/PrivacyNotice.js';
import { WorkspaceMigrationDialog } from './WorkspaceMigrationDialog.js';
import { Colors } from '../colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import process from 'node:process';

// Props for DialogManager
interface DialogManagerProps {}

export const DialogManager = (props: DialogManagerProps) => {
  const config = useConfig();
  const settings = useSettings();

  const uiState = useUIState();
  const uiActions = useUIActions();
  const { constrainHeight, terminalHeight, staticExtraHeight, mainAreaWidth } =
    uiState;

  if (uiState.showWorkspaceMigrationDialog) {
    return (
      <WorkspaceMigrationDialog
        workspaceExtensions={uiState.workspaceExtensions}
        onOpen={uiActions.onWorkspaceMigrationDialogOpen}
        onClose={uiActions.onWorkspaceMigrationDialogClose}
      />
    );
  }
  if (uiState.shouldShowIdePrompt) {
    return (
      <IdeIntegrationNudge
        ide={config.getIdeClient().getCurrentIde()!}
        onComplete={uiActions.handleIdePromptComplete}
      />
    );
  }
  if (uiState.isFolderTrustDialogOpen) {
    return <FolderTrustDialog onSelect={uiActions.handleFolderTrustSelect} />;
  }
  if (uiState.shellConfirmationRequest) {
    return (
      <ShellConfirmationDialog request={uiState.shellConfirmationRequest} />
    );
  }
  if (uiState.confirmationRequest) {
    return (
      <Box flexDirection="column">
        {uiState.confirmationRequest.prompt}
        <Box paddingY={1}>
          <RadioButtonSelect
            items={[
              { label: 'Yes', value: true },
              { label: 'No', value: false },
            ]}
            onSelect={(value: boolean) => {
              uiState.confirmationRequest!.onConfirm(value);
            }}
          />
        </Box>
      </Box>
    );
  }
  if (uiState.isThemeDialogOpen) {
    return (
      <Box flexDirection="column">
        {uiState.themeError && (
          <Box marginBottom={1}>
            <Text color={Colors.AccentRed}>{uiState.themeError}</Text>
          </Box>
        )}
        <ThemeDialog
          onSelect={uiActions.handleThemeSelect}
          onHighlight={uiActions.handleThemeHighlight}
          settings={settings}
          availableTerminalHeight={
            constrainHeight ? terminalHeight - staticExtraHeight : undefined
          }
          terminalWidth={mainAreaWidth}
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
          onRestartRequest={() => process.exit(0)}
        />
      </Box>
    );
  }
  if (uiState.isAuthenticating) {
    return (
      <AuthInProgress
        onTimeout={() => {
          /* This is now handled in AppContainer */
        }}
      />
    );
  }
  if (uiState.isAuthDialogOpen) {
    return (
      <Box flexDirection="column">
        <AuthDialog
          onSelect={uiActions.handleAuthSelect}
          settings={settings}
          initialErrorMessage={uiState.authError}
        />
      </Box>
    );
  }
  if (uiState.isEditorDialogOpen) {
    return (
      <Box flexDirection="column">
        {uiState.editorError && (
          <Box marginBottom={1}>
            <Text color={Colors.AccentRed}>{uiState.editorError}</Text>
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

  return null;
};
