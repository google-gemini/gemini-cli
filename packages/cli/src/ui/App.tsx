/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { StreamingContext } from './contexts/StreamingContext.js';
import { Notifications } from './components/Notifications.js';
import { MainContent } from './components/MainContent.js';
import { DialogManager } from './components/DialogManager.js';
import { Composer } from './components/Composer.js';
import { useUIState } from './contexts/UIStateContext.js';
import { QuittingDisplay } from './components/QuittingDisplay.js';

export const App = () => {
  const uiState = useUIState();

  if (uiState.quittingMessages) {
    return <QuittingDisplay />;
  }

  return (
    <StreamingContext.Provider value={uiState.streamingState}>
      <Box flexDirection="column" width="90%">
        {/*
         * The Static component is an Ink intrinsic in which there can only be 1 per application.
         * Because of this restriction we're hacking it slightly by having a 'header' item here to
         * ensure that it's statically rendered.
         *
         * Background on the Static Item: Anything in the Static component is written a single time
         * to the console. Think of it like doing a console.log and then never using ANSI codes to
         * clear that content ever again. Effectively it has a moving frame that every time new static
         * content is set it'll flush content to the terminal and move the area which it's "clearing"
         * down a notch. Without Static the area which gets erased and redrawn continuously grows.
         */}
        <Static
          key={staticKey}
          items={[
            <Box flexDirection="column" key="header">
              {!(
                settings.merged.ui?.hideBanner || config.getScreenReader()
              ) && <Header version={version} nightly={nightly} />}
              {!(settings.merged.ui?.hideTips || config.getScreenReader()) && (
                <Tips config={config} />
              )}
            </Box>,
            ...history.map((h) => (
              <HistoryItemDisplay
                terminalWidth={mainAreaWidth}
                availableTerminalHeight={staticAreaMaxItemHeight}
                key={h.id}
                item={h}
                isPending={false}
                config={config}
                commands={slashCommands}
              />
            )),
          ]}
        >
          {(item) => item}
        </Static>
        <OverflowProvider>
          <Box ref={pendingHistoryItemRef} flexDirection="column">
            {pendingHistoryItems.map((item, i) => (
              <HistoryItemDisplay
                key={i}
                availableTerminalHeight={
                  constrainHeight ? availableTerminalHeight : undefined
                }
                terminalWidth={mainAreaWidth}
                // TODO(taehykim): It seems like references to ids aren't necessary in
                // HistoryItemDisplay. Refactor later. Use a fake id for now.
                item={{ ...item, id: 0 }}
                isPending={true}
                config={config}
                isFocused={!isEditorDialogOpen}
              />
            ))}
            <ShowMoreLines constrainHeight={constrainHeight} />
          </Box>
        </OverflowProvider>

        <Box flexDirection="column" ref={mainControlsRef}>
          {/* Move UpdateNotification to render update notification above input area */}
          {updateInfo && <UpdateNotification message={updateInfo.message} />}
          {startupWarnings.length > 0 && (
            <Box
              borderStyle="round"
              borderColor={Colors.AccentYellow}
              paddingX={1}
              marginY={1}
              flexDirection="column"
            >
              {startupWarnings.map((warning, index) => (
                <Text key={index} color={Colors.AccentYellow}>
                  {warning}
                </Text>
              ))}
            </Box>
          )}
          {showWorkspaceMigrationDialog ? (
            <WorkspaceMigrationDialog
              workspaceExtensions={workspaceExtensions}
              onOpen={onWorkspaceMigrationDialogOpen}
              onClose={onWorkspaceMigrationDialogClose}
            />
          ) : shouldShowIdePrompt && currentIDE ? (
            <IdeIntegrationNudge
              ide={currentIDE}
              onComplete={handleIdePromptComplete}
            />
          ) : isProQuotaDialogOpen ? (
            <ProQuotaDialog
              currentModel={config.getModel()}
              fallbackModel={DEFAULT_GEMINI_FLASH_MODEL}
              onChoice={(choice) => {
                setIsProQuotaDialogOpen(false);
                if (!proQuotaDialogResolver) return;

                const resolveValue = choice !== 'auth';
                proQuotaDialogResolver(resolveValue);
                setProQuotaDialogResolver(null);

                if (choice === 'auth') {
                  openAuthDialog();
                } else {
                  addItem(
                    {
                      type: MessageType.INFO,
                      text: 'Switched to fallback model. Tip: Press Ctrl+P to recall your previous prompt and submit it again if you wish.',
                    },
                    Date.now(),
                  );
                }
              }}
            />
          ) : showIdeRestartPrompt ? (
            <Box
              borderStyle="round"
              borderColor={Colors.AccentYellow}
              paddingX={1}
            >
              <Text color={Colors.AccentYellow}>
                Workspace trust has changed. Press &apos;r&apos; to restart
                Gemini to apply the changes.
              </Text>
            </Box>
          ) : isFolderTrustDialogOpen ? (
            <FolderTrustDialog
              onSelect={handleFolderTrustSelect}
              isRestarting={isRestarting}
            />
          ) : shellConfirmationRequest ? (
            <ShellConfirmationDialog request={shellConfirmationRequest} />
          ) : confirmationRequest ? (
            <Box flexDirection="column">
              {confirmationRequest.prompt}
              <Box paddingY={1}>
                <RadioButtonSelect
                  isFocused={!!confirmationRequest}
                  items={[
                    { label: 'Yes', value: true },
                    { label: 'No', value: false },
                  ]}
                  onSelect={(value: boolean) => {
                    confirmationRequest.onConfirm(value);
                  }}
                />
              </Box>
            </Box>
          ) : isThemeDialogOpen ? (
            <Box flexDirection="column">
              {themeError && (
                <Box marginBottom={1}>
                  <Text color={Colors.AccentRed}>{themeError}</Text>
                </Box>
              )}
              <ThemeDialog
                onSelect={handleThemeSelect}
                onHighlight={handleThemeHighlight}
                settings={settings}
                availableTerminalHeight={
                  constrainHeight
                    ? terminalHeight - staticExtraHeight
                    : undefined
                }
                terminalWidth={mainAreaWidth}
              />
            </Box>
          ) : isSettingsDialogOpen ? (
            <Box flexDirection="column">
              <SettingsDialog
                settings={settings}
                onSelect={() => closeSettingsDialog()}
                onRestartRequest={() => process.exit(0)}
                availableTerminalHeight={
                  constrainHeight
                    ? terminalHeight - staticExtraHeight
                    : undefined
                }
              />
            </Box>
          ) : isAuthenticating ? (
            <>
              <AuthInProgress
                onTimeout={() => {
                  setAuthError('Authentication timed out. Please try again.');
                  cancelAuthentication();
                  openAuthDialog();
                }}
              />
              {showErrorDetails && (
                <OverflowProvider>
                  <Box flexDirection="column">
                    <DetailedMessagesDisplay
                      messages={filteredConsoleMessages}
                      maxHeight={
                        constrainHeight ? debugConsoleMaxHeight : undefined
                      }
                      width={inputWidth}
                    />
                    <ShowMoreLines constrainHeight={constrainHeight} />
                  </Box>
                </OverflowProvider>
              )}
            </>
          ) : isAuthDialogOpen ? (
            <Box flexDirection="column">
              <AuthDialog
                onSelect={handleAuthSelect}
                settings={settings}
                initialErrorMessage={authError}
              />
            </Box>
          ) : isEditorDialogOpen ? (
            <Box flexDirection="column">
              {editorError && (
                <Box marginBottom={1}>
                  <Text color={Colors.AccentRed}>{editorError}</Text>
                </Box>
              )}
              <EditorSettingsDialog
                onSelect={handleEditorSelect}
                settings={settings}
                onExit={exitEditorDialog}
              />
            </Box>
          ) : showPrivacyNotice ? (
            <PrivacyNotice
              onExit={() => setShowPrivacyNotice(false)}
              config={config}
            />
          ) : (
            <>
              <LoadingIndicator
                thought={
                  streamingState === StreamingState.WaitingForConfirmation ||
                  config.getAccessibility()?.disableLoadingPhrases ||
                  config.getScreenReader()
                    ? undefined
                    : thought
                }
                currentLoadingPhrase={
                  config.getAccessibility()?.disableLoadingPhrases ||
                  config.getScreenReader()
                    ? undefined
                    : currentLoadingPhrase
                }
                elapsedTime={elapsedTime}
              />
              {/* Display queued messages below loading indicator */}
              {messageQueue.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  {messageQueue
                    .slice(0, MAX_DISPLAYED_QUEUED_MESSAGES)
                    .map((message, index) => {
                      // Ensure multi-line messages are collapsed for the preview.
                      // Replace all whitespace (including newlines) with a single space.
                      const preview = message.replace(/\s+/g, ' ');

        <MainContent />

        <Box flexDirection="column" ref={uiState.mainControlsRef}>
          <Notifications />

          {uiState.dialogsVisible ? <DialogManager /> : <Composer />}
        </Box>
      </Box>
    </StreamingContext.Provider>
  );
};
