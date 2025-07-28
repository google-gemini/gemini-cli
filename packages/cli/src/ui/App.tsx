/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Box, Text, useStdin, useInput, type Key as InkKeyType } from 'ink';
import { StreamingState, type HistoryItem, MessageType } from './types.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useSlashCommandProcessor } from './hooks/slashCommandProcessor.js';
import { useAutoAcceptIndicator } from './hooks/useAutoAcceptIndicator.js';
import { useConsoleMessages } from './hooks/useConsoleMessages.js';
import { Header } from './components/Header.js';
import { LoadingIndicator } from './components/LoadingIndicator.js';
import { AutoAcceptIndicator } from './components/AutoAcceptIndicator.js';
import { ShellModeIndicator } from './components/ShellModeIndicator.js';
import { InputPrompt } from './components/InputPrompt.js';
import { Footer } from './components/Footer.js';
import { ThemeDialog } from './components/ThemeDialog.js';
import { AuthDialog } from './components/AuthDialog.js';
import { AuthInProgress } from './components/AuthInProgress.js';
import { EditorSettingsDialog } from './components/EditorSettingsDialog.js';
import { Colors } from './colors.js';
import { Help } from './components/Help.js';
import { loadHierarchicalGeminiMemory } from '../config/config.js';
import { LoadedSettings, SettingScope } from '../config/settings.js';
import { Tips } from './components/Tips.js';
import { ConsolePatcher } from './utils/ConsolePatcher.js';
import { registerCleanup } from '../utils/cleanup.js';
import { DetailedMessagesDisplay } from './components/DetailedMessagesDisplay.js';
import { HistoryItemDisplay } from './components/HistoryItemDisplay.js';
import { ContextSummaryDisplay } from './components/ContextSummaryDisplay.js';
import { UseHistoryManagerReturn } from './hooks/useHistoryManager.js';
import process from 'node:process';
import {
  getErrorMessage,
  type Config,
  getAllGeminiMdFilenames,
  ApprovalMode,
  isEditorAvailable,
  EditorType,
  FlashFallbackEvent,
  logFlashFallback,
  AuthType,
  type OpenFiles,
  ideContext,
  UserTierId,
  isProQuotaExceededError,
  isGenericQuotaExceededError,
} from '@google/gemini-cli-core';
import { validateAuthMethod } from '../config/auth.js';
import { useLogger } from './hooks/useLogger.js';
import { StreamingContext } from './contexts/StreamingContext.js';
import { useSessionStats } from './contexts/SessionContext.js';
import { useGitBranchName } from './hooks/useGitBranchName.js';
import { useFocus } from './hooks/useFocus.js';
import { useBracketedPaste } from './hooks/useBracketedPaste.js';
import * as fs from 'fs';
import { UpdateNotification } from './components/UpdateNotification.js';
import { checkForUpdates } from './utils/updateCheck.js';
import { OverflowProvider } from './contexts/OverflowContext.js';
import { ShowMoreLines } from './components/ShowMoreLines.js';
import { PrivacyNotice } from './privacy/PrivacyNotice.js';
import { Conversation } from './components/Conversation.js';
import { useUI } from './contexts/UIContext.js';

const CTRL_EXIT_PROMPT_DURATION_MS = 1000;

interface AppProps extends UseHistoryManagerReturn {
  config: Config;
  settings: LoadedSettings;
  startupWarnings?: string[];
  version: string;
  isThemeDialogOpen: boolean;
  themeError: string | null;
  handleThemeSelect: (
    themeName: string | undefined,
    scope: SettingScope,
  ) => void;
  handleThemeHighlight: (themeName: string | undefined) => void;
  isAuthenticating: boolean;
  authError: string | null;
  cancelAuthentication: () => void;
  isAuthDialogOpen: boolean;
  handleAuthSelect: (
    authType: AuthType | undefined,
    scope: SettingScope,
  ) => void;
  editorError: string | null;
  isEditorDialogOpen: boolean;
  handleEditorSelect: (
    editorType: EditorType | undefined,
    scope: SettingScope,
  ) => void;
  exitEditorDialog: () => void;
  showPrivacyNotice: boolean;
  setShowPrivacyNotice: (show: boolean) => void;
  showHelp: boolean;
  corgiMode: boolean;
  debugMessage: string;
  quittingMessages: HistoryItem[] | null;
}

export const App = (props: AppProps) => {
  const {
    config,
    settings,
    startupWarnings = [],
    version,
    history,
    addItem,
    clearItems,
    loadHistory,
    isThemeDialogOpen,
    themeError,
    handleThemeSelect,
    handleThemeHighlight,
    isAuthenticating,
    authError,
    isAuthDialogOpen,
    handleAuthSelect,
    editorError,
    isEditorDialogOpen,
    handleEditorSelect,
    exitEditorDialog,
    showPrivacyNotice,
    setShowPrivacyNotice,
    showHelp,
    corgiMode,
    debugMessage,
    quittingMessages,
  } = props;

  const ui = useUI();
  const isFocused = useFocus();
  useBracketedPaste();
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const nightly = version.includes('nightly');

  useEffect(() => {
    checkForUpdates().then(setUpdateMessage);
  }, []);

  const {
    consoleMessages,
    handleNewMessage,
    clearConsoleMessages: clearConsoleMessagesState,
  } = useConsoleMessages();

  useEffect(() => {
    const consolePatcher = new ConsolePatcher({
      onNewMessage: handleNewMessage,
      debugMode: config.getDebugMode(),
    });
    consolePatcher.patch();
    registerCleanup(consolePatcher.cleanup);
  }, [handleNewMessage, config]);

  const { stats: sessionStats } = useSessionStats();

  const [geminiMdFileCount, setGeminiMdFileCount] = useState<number>(0);
  const [currentModel, setCurrentModel] = useState(config.getModel());
  const [shellModeActive, setShellModeActive] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState<boolean>(false);
  const [showToolDescriptions, setShowToolDescriptions] =
    useState<boolean>(false);
  const [ctrlCPressedOnce, setCtrlCPressedOnce] = useState(false);
  const ctrlCTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [ctrlDPressedOnce, setCtrlDPressedOnce] = useState(false);
  const ctrlDTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [modelSwitchedFromQuotaError, setModelSwitchedFromQuotaError] =
    useState<boolean>(false);
  const [userTier, setUserTier] = useState<UserTierId | undefined>(undefined);
  const [openFiles, setOpenFiles] = useState<OpenFiles | undefined>();

  useEffect(() => {
    const unsubscribe = ideContext.subscribeToOpenFiles(setOpenFiles);
    setOpenFiles(ideContext.getOpenFilesContext());
    return unsubscribe;
  }, []);

  const initialPromptSubmitted = useRef(false);

  const errorCount = useMemo(
    () => consoleMessages.filter((msg) => msg.type === 'error').length,
    [consoleMessages],
  );

  useEffect(() => {
    if (settings.merged.selectedAuthType) {
      const error = validateAuthMethod(settings.merged.selectedAuthType);
      if (error) {
        // This is now handled in AppContainer, but we might need a way
        // to signal back up if an error occurs here. For now, this is a no-op.
      }
    }
  }, [settings.merged.selectedAuthType]);

  useEffect(() => {
    if (!isAuthenticating) {
      setUserTier(config.getGeminiClient()?.getUserTier());
    }
  }, [config, isAuthenticating]);

  const performMemoryRefresh = useCallback(async () => {
    addItem(
      {
        type: MessageType.INFO,
        text: 'Refreshing hierarchical memory (GEMINI.md or other context files)...',
      },
      Date.now(),
    );
    try {
      const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
        process.cwd(),
        config.getDebugMode(),
        config.getFileService(),
        config.getExtensionContextFilePaths(),
        config.getFileFilteringOptions(),
      );

      config.setUserMemory(memoryContent);
      config.setGeminiMdFileCount(fileCount);
      setGeminiMdFileCount(fileCount);

      addItem(
        {
          type: MessageType.INFO,
          text: `Memory refreshed successfully. ${
            memoryContent.length > 0
              ? `Loaded ${memoryContent.length} characters from ${fileCount} file(s).`
              : 'No memory content found.'
          }`,
        },
        Date.now(),
      );
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      addItem(
        {
          type: MessageType.ERROR,
          text: `Error refreshing memory: ${errorMessage}`,
        },
        Date.now(),
      );
    }
  }, [config, addItem]);

  useEffect(() => {
    const unsubscribe = config.subscribeToModelChanges(setCurrentModel);
    return unsubscribe;
  }, [config]);

  useEffect(() => {
    const flashFallbackHandler = async (
      currentModel: string,
      fallbackModel: string,
      error?: unknown,
    ): Promise<boolean> => {
      let message: string;

      if (
        config.getContentGeneratorConfig().authType ===
        AuthType.LOGIN_WITH_GOOGLE
      ) {
        // Use actual user tier if available; otherwise, default to FREE tier behavior (safe default)
        const isPaidTier =
          userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;

        // Check if this is a Pro quota exceeded error
        if (error && isProQuotaExceededError(error)) {
          if (isPaidTier) {
            message = `⚡ You have reached your daily ${currentModel} quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
          } else {
            message = `⚡ You have reached your daily ${currentModel} quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
          }
        } else if (error && isGenericQuotaExceededError(error)) {
          if (isPaidTier) {
            message = `⚡ You have reached your daily quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
          } else {
            message = `⚡ You have reached your daily quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
          }
        } else {
          if (isPaidTier) {
            // Default fallback message for other cases (like consecutive 429s)
            message = `⚡ Automatically switching from ${currentModel} to ${fallbackModel} for faster responses for the remainder of this session.
⚡ Possible reasons for this are that you have received multiple consecutive capacity errors or you have reached your daily ${currentModel} quota limit
⚡ To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
          } else {
            // Default fallback message for other cases (like consecutive 429s)
            message = `⚡ Automatically switching from ${currentModel} to ${fallbackModel} for faster responses for the remainder of this session.
⚡ Possible reasons for this are that you have received multiple consecutive capacity errors or you have reached your daily ${currentModel} quota limit
⚡ To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
          }
        }

        // Add message to UI history
        addItem(
          {
            type: MessageType.INFO,
            text: message,
          },
          Date.now(),
        );

        // Set the flag to prevent tool continuation
        setModelSwitchedFromQuotaError(true);
        // Set global quota error flag to prevent Flash model calls
        config.setQuotaErrorOccurred(true);
      }

      // Switch model for future use but return false to stop current retry
      config.setModel(fallbackModel);
      logFlashFallback(
        config,
        new FlashFallbackEvent(config.getContentGeneratorConfig().authType!),
      );
      return false; // Don't continue with current prompt
    };

    config.setFlashFallbackHandler(flashFallbackHandler);
  }, [config, addItem, userTier]);

  const {
    handleSlashCommand,
    slashCommands,
    pendingHistoryItems: pendingSlashCommandHistoryItems,
    commandContext,
  } = useSlashCommandProcessor(
    config,
    settings,
    addItem,
    clearItems,
    loadHistory,
    () => {},
  );
  const pendingHistoryItems = [...pendingSlashCommandHistoryItems];

  const { columns: terminalWidth } = useTerminalSize();
  const { stdin, setRawMode } = useStdin();
  const isValidPath = useCallback((filePath: string): boolean => {
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch (_e) {
      return false;
    }
  }, []);

  const widthFraction = 0.9;
  const inputWidth = Math.max(
    20,
    Math.floor(terminalWidth * widthFraction) - 3,
  );
  const suggestionsWidth = Math.max(60, Math.floor(terminalWidth * 0.8));
  const inputTextRef = useRef('');

  const handleTextChange = useCallback((text: string) => {
    inputTextRef.current = text;
  }, []);

  const handleExit = useCallback(
    (
      pressedOnce: boolean,
      setPressedOnce: (value: boolean) => void,
      timerRef: React.MutableRefObject<NodeJS.Timeout | null>,
    ) => {
      if (pressedOnce) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        handleSlashCommand('/quit');
      } else {
        setPressedOnce(true);
        timerRef.current = setTimeout(() => {
          setPressedOnce(false);
          timerRef.current = null;
        }, CTRL_EXIT_PROMPT_DURATION_MS);
      }
    },
    [handleSlashCommand],
  );

  useInput((input: string, key: InkKeyType) => {
    if (key.ctrl && input === 'o') {
      setShowErrorDetails((prev) => !prev);
    } else if (key.ctrl && input === 't') {
      const newValue = !showToolDescriptions;
      setShowToolDescriptions(newValue);
      if (Object.keys(config.getMcpServers() || {}).length > 0) {
        handleSlashCommand(newValue ? '/mcp desc' : '/mcp nodesc');
      }
    } else if (key.ctrl && (input === 'c' || input === 'C')) {
      handleExit(ctrlCPressedOnce, setCtrlCPressedOnce, ctrlCTimerRef);
    } else if (key.ctrl && (input === 'd' || input === 'D')) {
      if (inputTextRef.current.length > 0) return;
      handleExit(ctrlDPressedOnce, setCtrlDPressedOnce, ctrlDTimerRef);
    }
  });

  useEffect(() => {
    if (config) {
      setGeminiMdFileCount(config.getGeminiMdFileCount());
    }
  }, [config]);

  const getPreferredEditor = useCallback(() => {
    const editorType = settings.merged.preferredEditor;
    if (!isEditorAvailable(editorType)) {
      ui.openEditorDialog();
      return;
    }
    return editorType as EditorType;
  }, [settings, ui]);

  const onAuthError = useCallback(() => {
    ui.openAuthDialog();
  }, [ui]);

  const {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems: pendingGeminiHistoryItems,
    thought,
  } = useGeminiStream(
    config.getGeminiClient(),
    history,
    addItem,
    ui.openHelp,
    config,
    ui.setDebugMessage,
    handleSlashCommand,
    shellModeActive,
    getPreferredEditor,
    onAuthError,
    performMemoryRefresh,
    modelSwitchedFromQuotaError,
    setModelSwitchedFromQuotaError,
  );
  pendingHistoryItems.push(...pendingGeminiHistoryItems);
  const { elapsedTime, currentLoadingPhrase } =
    useLoadingIndicator(streamingState);
  const showAutoAcceptIndicator = useAutoAcceptIndicator({ config });

  const handleFinalSubmit = useCallback(
    (submittedValue: string) => {
      const trimmedValue = submittedValue.trim();
      if (trimmedValue.length > 0) {
        submitQuery(trimmedValue);
      }
    },
    [submitQuery],
  );

  const logger = useLogger();
  const [userMessages, setUserMessages] = useState<string[]>([]);

  useEffect(() => {
    const fetchUserMessages = async () => {
      const pastMessagesRaw = (await logger?.getPreviousUserMessages()) || [];
      const currentSessionUserMessages = history
        .filter(
          (item): item is HistoryItem & { type: 'user'; text: string } =>
            item.type === 'user' && typeof item.text === 'string',
        )
        .map((item) => item.text)
        .reverse();
      const combined = [...currentSessionUserMessages, ...pastMessagesRaw];
      const deduplicated: string[] = [];
      if (combined.length > 0) {
        deduplicated.push(combined[0]);
        for (let i = 1; i < combined.length; i++) {
          if (combined[i] !== combined[i - 1]) {
            deduplicated.push(combined[i]);
          }
        }
      }
      setUserMessages(deduplicated.reverse());
    };
    fetchUserMessages();
  }, [history, logger]);

  const isInputActive = streamingState === StreamingState.Idle && !initError;

  const handleClearScreen = () => {
    clearItems();
    clearConsoleMessagesState();
    console.clear();
  };

  const filteredConsoleMessages = useMemo(() => {
    if (config.getDebugMode()) {
      return consoleMessages;
    }
    return consoleMessages.filter((msg) => msg.type !== 'debug');
  }, [consoleMessages, config]);

  const branchName = useGitBranchName(config.getTargetDir());

  const contextFileNames = useMemo(() => {
    const fromSettings = settings.merged.contextFileName;
    return fromSettings
      ? Array.isArray(fromSettings)
        ? fromSettings
        : [fromSettings]
      : getAllGeminiMdFilenames();
  }, [settings.merged.contextFileName]);

  const initialPrompt = useMemo(() => config.getQuestion(), [config]);
  const geminiClient = config.getGeminiClient();

  useEffect(() => {
    if (
      initialPrompt &&
      !initialPromptSubmitted.current &&
      !isAuthenticating &&
      !isAuthDialogOpen &&
      !isThemeDialogOpen &&
      !isEditorDialogOpen &&
      !showPrivacyNotice &&
      geminiClient?.isInitialized?.()
    ) {
      submitQuery(initialPrompt);
      initialPromptSubmitted.current = true;
    }
  }, [
    initialPrompt,
    submitQuery,
    isAuthenticating,
    isAuthDialogOpen,
    isThemeDialogOpen,
    isEditorDialogOpen,
    showPrivacyNotice,
    geminiClient,
  ]);

  const QuittingSession = ({ messages }: { messages: HistoryItem[] }) => (
    <Box flexDirection="column" marginBottom={1}>
      {messages.map((item) => (
        <HistoryItemDisplay
          key={item.id}
          terminalWidth={terminalWidth}
          item={item}
          isPending={false}
          config={config}
        />
      ))}
    </Box>
  );

  

  const mainAreaWidth = Math.floor(terminalWidth * 0.9);
  const debugConsoleMaxHeight = Math.floor(Math.max(terminalWidth * 0.2, 5));

  const memoizedHeader = useMemo(
    () =>
      !settings.merged.hideBanner && (
        <Header
          terminalWidth={terminalWidth}
          version={version}
          nightly={nightly}
        />
      ),
    [settings.merged.hideBanner, terminalWidth, version, nightly],
  );

  const memoizedTips = useMemo(
    () => !settings.merged.hideTips && <Tips config={config} />,
    [settings.merged.hideTips, config],
  );

  const memoizedConversation = useMemo(
    () => (
      <Conversation
        history={history}
        config={config}
        terminalWidth={terminalWidth}
      />
    ),
    [history, config, terminalWidth],
  );

  const memoizedPendingHistory = useMemo(
    () => (
      <OverflowProvider>
        <Box flexDirection="column">
          {pendingHistoryItems.map((item, i) => (
            <HistoryItemDisplay
              key={i}
              terminalWidth={mainAreaWidth}
              item={{ ...item, id: 0 }}
              isPending={true}
              config={config}
              isFocused={!isEditorDialogOpen}
            />
          ))}
          <ShowMoreLines />
        </Box>
      </OverflowProvider>
    ),
    [pendingHistoryItems, mainAreaWidth, config, isEditorDialogOpen],
  );

  const memoizedHelp = useMemo(
    () => showHelp && <Help commands={slashCommands} />,
    [showHelp, slashCommands],
  );

  const memoizedStartupWarnings = useMemo(
    () =>
      startupWarnings.length > 0 && (
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
      ),
    [startupWarnings],
  );

  const memoizedFooter = useMemo(
    () => (
      <Footer
        model={currentModel}
        targetDir={config.getTargetDir()}
        debugMode={config.getDebugMode()}
        branchName={branchName}
        debugMessage={debugMessage}
        corgiMode={corgiMode}
        errorCount={errorCount}
        showErrorDetails={showErrorDetails}
        showMemoryUsage={
          config.getDebugMode() || config.getShowMemoryUsage()
        }
        promptTokenCount={sessionStats.lastPromptTokenCount}
        nightly={nightly}
      />
    ),
    [
      currentModel,
      config,
      branchName,
      debugMessage,
      corgiMode,
      errorCount,
      showErrorDetails,
      sessionStats.lastPromptTokenCount,
      nightly,
    ],
  );

  const Dialogs = () => (
    <>
      {isThemeDialogOpen ? (
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
            terminalWidth={mainAreaWidth}
          />
        </Box>
      ) : isAuthenticating ? (
        <>
          <AuthInProgress
            onTimeout={() => {
              // This is now handled in AppContainer
            }}
          />
          {showErrorDetails && (
            <OverflowProvider>
              <Box flexDirection="column">
                <DetailedMessagesDisplay
                  messages={filteredConsoleMessages}
                  maxHeight={debugConsoleMaxHeight}
                  width={inputWidth}
                />
                <ShowMoreLines />
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
      ) : null}
    </>
  );

  const ActiveSession = () => (
    <>
      <LoadingIndicator
        thought={
          streamingState === StreamingState.WaitingForConfirmation ||
          config.getAccessibility()?.disableLoadingPhrases
            ? undefined
            : thought
        }
        currentLoadingPhrase={
          config.getAccessibility()?.disableLoadingPhrases
            ? undefined
            : currentLoadingPhrase
        }
        elapsedTime={elapsedTime}
      />
      <Box
        marginTop={1}
        display="flex"
        justifyContent="space-between"
        width="100%"
      >
        <Box>
          {process.env.GEMINI_SYSTEM_MD && (
            <Text color={Colors.AccentRed}>|⌐■_■| </Text>
          )}
          {ctrlCPressedOnce ? (
            <Text color={Colors.AccentYellow}>Press Ctrl+C again to exit.</Text>
          ) : ctrlDPressedOnce ? (
            <Text color={Colors.AccentYellow}>Press Ctrl+D again to exit.</Text>
          ) : (
            <ContextSummaryDisplay
              openFiles={openFiles}
              geminiMdFileCount={geminiMdFileCount}
              contextFileNames={contextFileNames}
              mcpServers={config.getMcpServers()}
              blockedMcpServers={config.getBlockedMcpServers()}
              showToolDescriptions={showToolDescriptions}
            />
          )}
        </Box>
        <Box>
          {showAutoAcceptIndicator !== ApprovalMode.DEFAULT &&
            !shellModeActive && (
              <AutoAcceptIndicator approvalMode={showAutoAcceptIndicator} />
            )}
          {shellModeActive && <ShellModeIndicator />}
        </Box>
      </Box>

      {showErrorDetails && (
        <OverflowProvider>
          <Box flexDirection="column">
            <DetailedMessagesDisplay
              messages={filteredConsoleMessages}
              maxHeight={debugConsoleMaxHeight}
              width={inputWidth}
            />
            <ShowMoreLines />
          </Box>
        </OverflowProvider>
      )}

      {isInputActive && (
        <InputPrompt
          inputWidth={inputWidth}
          suggestionsWidth={suggestionsWidth}
          onSubmit={handleFinalSubmit}
          onTextChange={handleTextChange}
          userMessages={userMessages}
          onClearScreen={handleClearScreen}
          config={config}
          slashCommands={slashCommands}
          commandContext={commandContext}
          shellModeActive={shellModeActive}
          setShellModeActive={setShellModeActive}
          focus={isFocused}
        />
      )}
    </>
  );

  const showDialog =
    isThemeDialogOpen ||
    isAuthenticating ||
    isAuthDialogOpen ||
    isEditorDialogOpen ||
    showPrivacyNotice;

  return (
    <StreamingContext.Provider value={streamingState}>
      {quittingMessages ? (
        <QuittingSession messages={quittingMessages} />
      ) : (
        <Box flexDirection="column" width="90%" height="100%">
          {updateMessage && <UpdateNotification message={updateMessage} />}
          {memoizedHeader}
          {memoizedTips}
          {memoizedConversation}
          {memoizedPendingHistory}
          {memoizedHelp}

          <Box flexDirection="column">
            {memoizedStartupWarnings}

            {showDialog ? <Dialogs /> : <ActiveSession />}

            {initError && streamingState !== StreamingState.Responding && (
              <Box
                borderStyle="round"
                borderColor={Colors.AccentRed}
                paddingX={1}
                marginBottom={1}
              >
                <Text color={Colors.AccentRed}>
                  Initialization Error: {initError}
                </Text>
              </Box>
            )}
            {memoizedFooter}
          </Box>
        </Box>
      )}
    </StreamingContext.Provider>
  );
};
