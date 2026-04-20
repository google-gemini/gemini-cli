/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  useLayoutEffect,
  useContext,
} from 'react';
import {
  type DOMElement,
  ResizeObserver,
  useApp,
  useStdout,
  useStdin,
  type AppProps,
  AppContext as InkAppContext,
} from 'ink';
import { App } from './App.js';
import { AppContext } from './contexts/AppContext.js';
import { UIStateContext, type UIState } from './contexts/UIStateContext.js';
import { QuotaContext } from './contexts/QuotaContext.js';
import {
  UIActionsContext,
  type UIActions,
} from './contexts/UIActionsContext.js';
import { ConfigContext } from './contexts/ConfigContext.js';
import {
  type HistoryItem,
  AuthState,
  type ConfirmationRequest,
  type PermissionConfirmationRequest,
  type QuotaStats,
  MessageType,
  StreamingState,
  type HistoryItemInfo,
} from './types.js';
import { checkPermissions } from './hooks/atCommandProcessor.js';
import { ToolActionsProvider } from './contexts/ToolActionsContext.js';
import { MouseProvider } from './contexts/MouseContext.js';
import { ScrollProvider } from './contexts/ScrollProvider.js';
import {
  type StartupWarning,
  type EditorType,
  type Config,
  type IdeInfo,
  type IdeContext,
  type UserTierId,
  type GeminiUserTier,
  type UserFeedbackPayload,
  type HookSystemMessagePayload,
  type AgentDefinition,
  type ApprovalMode,
  IdeClient,
  ideContextStore,
  getErrorMessage,
  getAllGeminiMdFilenames,
  AuthType,
  clearCachedCredentialFile,
  type ResumedSessionData,
  recordExitFail,
  ShellExecutionService,
  saveApiKey,
  debugLogger,
  coreEvents,
  CoreEvent,
  refreshServerHierarchicalMemory,
  flattenMemory,
  type MemoryChangedPayload,
  writeToStdout,
  disableMouseEvents,
  enterAlternateScreen,
  enableMouseEvents,
  disableLineWrapping,
  shouldEnterAlternateScreen,
  startupProfiler,
  SessionStartSource,
  SessionEndReason,
  generateSummary,
  type ConsentRequestPayload,
  type AgentsDiscoveredPayload,
  ChangeAuthRequestedError,
  ProjectIdRequiredError,
  buildUserSteeringHintPrompt,
  logBillingEvent,
  ApiKeyUpdatedEvent,
  LegacyAgentProtocol,
  type InjectionSource,
  startMemoryService,
} from '@google/gemini-cli-core';
import { validateAuthMethod } from '../config/auth.js';
import process from 'node:process';
import { useHistory } from './hooks/useHistoryManager.js';
import { useMemoryMonitor } from './hooks/useMemoryMonitor.js';
import { useThemeCommand } from './hooks/useThemeCommand.js';
import { useAuthCommand } from './auth/useAuth.js';
import { useQuotaAndFallback } from './hooks/useQuotaAndFallback.js';
import { useEditorSettings } from './hooks/useEditorSettings.js';
import { useSettingsCommand } from './hooks/useSettingsCommand.js';
import { useModelCommand } from './hooks/useModelCommand.js';
import { useSlashCommandProcessor } from './hooks/slashCommandProcessor.js';
import { useVimMode } from './contexts/VimModeContext.js';
import {
  useOverflowActions,
  useOverflowState,
} from './contexts/OverflowContext.js';
import { useErrorCount } from './hooks/useConsoleMessages.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { calculatePromptWidths } from './components/InputPrompt.js';
import { calculateMainAreaWidth } from './utils/ui-sizing.js';
import ansiEscapes from 'ansi-escapes';
import { basename } from 'node:path';
import { computeTerminalTitle } from '../utils/windowTitle.js';
import { useTextBuffer } from './components/shared/text-buffer.js';
import { useLogger } from './hooks/useLogger.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useAgentStream } from './hooks/useAgentStream.js';
import { type BackgroundTask } from './hooks/useExecutionLifecycle.js';
import { useVim } from './hooks/vim.js';
import { type LoadableSettingScope, SettingScope } from '../config/settings.js';
import { type InitializationResult } from '../core/initializer.js';
import { useFocus } from './hooks/useFocus.js';
import { useKeypress, type Key } from './hooks/useKeypress.js';
import { KeypressPriority } from './contexts/KeypressContext.js';
import { Command } from './key/keyMatchers.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useShellInactivityStatus } from './hooks/useShellInactivityStatus.js';
import { useFolderTrust } from './hooks/useFolderTrust.js';
import { useIdeTrustListener } from './hooks/useIdeTrustListener.js';
import { type IdeIntegrationNudgeResult } from './IdeIntegrationNudge.js';
import { appEvents, AppEvent, TransientMessageType } from '../utils/events.js';
import { type UpdateObject } from './utils/updateCheck.js';
import { setUpdateHandler } from '../utils/handleAutoUpdate.js';
import {
  registerCleanup,
  removeCleanup,
  runExitCleanup,
} from '../utils/cleanup.js';
import { relaunchApp } from '../utils/processUtils.js';
import type { SessionInfo } from '../utils/sessionUtils.js';
import { useMessageQueue } from './hooks/useMessageQueue.js';
import { useMcpStatus } from './hooks/useMcpStatus.js';
import { useApprovalModeIndicator } from './hooks/useApprovalModeIndicator.js';
import { useSessionStats } from './contexts/SessionContext.js';
import { useGitBranchName } from './hooks/useGitBranchName.js';
import {
  useConfirmUpdateRequests,
  useExtensionUpdates,
} from './hooks/useExtensionUpdates.js';
import { ShellFocusContext } from './contexts/ShellFocusContext.js';
import { type ExtensionManager } from '../config/extension-manager.js';
import { requestConsentInteractive } from '../config/extensions/consent.js';
import { useSessionBrowser } from './hooks/useSessionBrowser.js';
import { useSessionResume } from './hooks/useSessionResume.js';
import { useIncludeDirsTrust } from './hooks/useIncludeDirsTrust.js';
import { isWorkspaceTrusted } from '../config/trustedFolders.js';
import { useSettings } from './contexts/SettingsContext.js';
import { terminalCapabilityManager } from './utils/terminalCapabilityManager.js';
import { useInputHistoryStore } from './hooks/useInputHistoryStore.js';
import { useBanner } from './hooks/useBanner.js';
import { useTerminalSetupPrompt } from './utils/terminalSetup.js';
import { useHookDisplayState } from './hooks/useHookDisplayState.js';
import { useBackgroundTaskManager } from './hooks/useBackgroundTaskManager.js';
import {
  WARNING_PROMPT_DURATION_MS,
  QUEUE_ERROR_DISPLAY_DURATION_MS,
  EXPAND_HINT_DURATION_MS,
} from './constants.js';
import { LoginWithGoogleRestartDialog } from './auth/LoginWithGoogleRestartDialog.js';
import { NewAgentsChoice } from './components/NewAgentsNotification.js';
import { isSlashCommand } from './utils/commandUtils.js';
import { parseSlashCommand } from '../utils/commands.js';
import { useTerminalTheme } from './hooks/useTerminalTheme.js';
import { useTimedMessage } from './hooks/useTimedMessage.js';
import { useIsHelpDismissKey } from './utils/shortcutsHelp.js';
import { useSuspend } from './hooks/useSuspend.js';
import { useRunEventNotifications } from './hooks/useRunEventNotifications.js';
import {
  isNotificationsEnabled,
  getNotificationMethod,
} from '../utils/terminalNotifications.js';
import {
  getLastTurnToolCallIds,
  isToolExecuting,
  isToolAwaitingConfirmation,
  getAllToolCalls,
} from './utils/historyUtils.js';

interface AppContainerProps {
  config: Config;
  startupWarnings?: StartupWarning[];
  version: string;
  initializationResult: InitializationResult;
  resumedSessionData?: ResumedSessionData;
}

import { useRepeatedKeyPress } from './hooks/useRepeatedKeyPress.js';
import {
  useVisibilityToggle,
  APPROVAL_MODE_REVEAL_DURATION_MS,
} from './hooks/useVisibilityToggle.js';
import { useKeyMatchers } from './hooks/useKeyMatchers.js';

import { InputContext } from './contexts/InputContext.js';

/**
 * The fraction of the terminal width to allocate to the shell.
 * This provides horizontal padding.
 */
const SHELL_WIDTH_FRACTION = 0.89;

/**
 * The number of lines to subtract from the available terminal height
 * for the shell. This provides vertical padding and space for other UI elements.
 */
const SHELL_HEIGHT_PADDING = 10;

export const AppContainer = (props: AppContainerProps) => {
  const isHelpDismissKey = useIsHelpDismissKey();
  const keyMatchers = useKeyMatchers();
  const { config, initializationResult, resumedSessionData } = props;
  const settings = useSettings();
  const { reset } = useOverflowActions()!;
  const notificationsEnabled = isNotificationsEnabled(settings);
  const notificationMethod = getNotificationMethod(settings);

  const { setOptions, dumpCurrentFrame, startRecording, stopRecording } =
    useContext(InkAppContext);
  const recordingFilenameRef = useRef<string | null>(null);
  const historyManager = useHistory({
    chatRecordingService: config.getGeminiClient()?.getChatRecordingService(),
  });

  useMemoryMonitor(historyManager);
  const isAlternateBuffer = config.getUseAlternateBuffer();
  const [mouseMode, setMouseMode] = useState(() =>
    config.getUseAlternateBuffer(),
  );

  useEffect(() => {
    setOptions({
      stickyHeadersInBackbuffer: mouseMode,
    });
    if (mouseMode) {
      enableMouseEvents();
    } else {
      disableMouseEvents();
    }
  }, [mouseMode, setOptions]);

  const [corgiMode, setCorgiMode] = useState(false);
  const [forceRerenderKey, setForceRerenderKey] = useState(0);
  const [debugMessage, setDebugMessage] = useState<string>('');
  const [quittingMessages, setQuittingMessages] = useState<
    HistoryItem[] | null
  >(null);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState<boolean>(false);
  const [themeError, setThemeError] = useState<string | null>(
    initializationResult.themeError,
  );
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [embeddedShellFocused, setEmbeddedShellFocused] = useState(false);
  const [showDebugProfiler, setShowDebugProfiler] = useState(false);
  const [customDialog, setCustomDialog] = useState<React.ReactNode | null>(
    null,
  );
  const [copyModeEnabled, setCopyModeEnabled] = useState(false);
  const [pendingRestorePrompt, setPendingRestorePrompt] = useState(false);
  const toggleBackgroundTasksRef = useRef<() => void>(() => {});
  const isBackgroundTaskVisibleRef = useRef<boolean>(false);
  const backgroundTasksRef = useRef<Map<number, BackgroundTask>>(new Map());

  const [adminSettingsChanged, setAdminSettingsChanged] = useState(false);

  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const toggleExpansion = useCallback((callId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
      }
      return next;
    });
  }, []);

  const toggleAllExpansion = useCallback((callIds: string[]) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      const anyCollapsed = callIds.some((id) => !next.has(id));

      if (anyCollapsed) {
        callIds.forEach((id) => next.add(id));
      } else {
        callIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  }, []);

  const isExpanded = useCallback(
    (callId: string) => expandedTools.has(callId),
    [expandedTools],
  );

  const [shellModeActive, setShellModeActive] = useState(false);
  const [modelSwitchedFromQuotaError, setModelSwitchedFromQuotaError] =
    useState<boolean>(false);
  const [historyRemountKey, setHistoryRemountKey] = useState(0);
  const [settingsNonce, setSettingsNonce] = useState(0);
  const activeHooks = useHookDisplayState();
  const [updateInfo, setUpdateInfo] = useState<UpdateObject | null>(null);
  const [isTrustedFolder, setIsTrustedFolder] = useState<boolean | undefined>(
    () => isWorkspaceTrusted(settings.merged).isTrusted,
  );

  const [queueErrorMessage, setQueueErrorMessage] = useTimedMessage<string>(
    QUEUE_ERROR_DISPLAY_DURATION_MS,
  );

  const [newAgents, setNewAgents] = useState<AgentDefinition[] | null>(null);
  const [constrainHeight, setConstrainHeight] = useState<boolean>(true);
  const [expandHintTrigger, triggerExpandHint] = useTimedMessage<boolean>(
    EXPAND_HINT_DURATION_MS,
  );
  const showIsExpandableHint = Boolean(expandHintTrigger);
  const overflowState = useOverflowState();
  const overflowingIdsSize = overflowState?.overflowingIds.size ?? 0;
  const hasOverflowState = overflowingIdsSize > 0 || !constrainHeight;

  /**
   * Manages the visibility and x-second timer for the expansion hint.
   *
   * This effect triggers the timer countdown whenever an overflow is detected
   * or the user manually toggles the expansion state with Ctrl+O.
   * By depending on overflowingIdsSize, the timer resets when *new* views
   * overflow, but avoids infinitely resetting during single-view streaming.
   *
   * In alternate buffer mode, we don't trigger the hint automatically on overflow
   * to avoid noise, but the user can still trigger it manually with Ctrl+O.
   */
  useEffect(() => {
    if (hasOverflowState) {
      triggerExpandHint(true);
    }
  }, [hasOverflowState, overflowingIdsSize, triggerExpandHint]);

  const [defaultBannerText, setDefaultBannerText] = useState('');
  const [warningBannerText, setWarningBannerText] = useState('');
  const [bannerVisible, setBannerVisible] = useState(true);

  const bannerData = useMemo(
    () => ({
      defaultText: defaultBannerText,
      warningText: warningBannerText,
    }),
    [defaultBannerText, warningBannerText],
  );

  const { bannerText } = useBanner(bannerData);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const extensionManager = config.getExtensionLoader() as ExtensionManager;
  // We are in the interactive CLI, update how we request consent and settings.
  extensionManager.setRequestConsent((description) =>
    requestConsentInteractive(description, addConfirmUpdateExtensionRequest),
  );
  extensionManager.setRequestSetting();

  const { addConfirmUpdateExtensionRequest, confirmUpdateExtensionRequests } =
    useConfirmUpdateRequests();
  const {
    extensionsUpdateState,
    extensionsUpdateStateInternal,
    dispatchExtensionStateUpdate,
  } = useExtensionUpdates(
    extensionManager,
    historyManager.addItem,
    config.getEnableExtensionReloading(),
  );

  const [isPermissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [permissionsDialogProps, setPermissionsDialogProps] = useState<{
    targetDirectory?: string;
  } | null>(null);
  const openPermissionsDialog = useCallback(
    (props?: { targetDirectory?: string }) => {
      setPermissionsDialogOpen(true);
      setPermissionsDialogProps(props ?? null);
    },
    [],
  );
  const closePermissionsDialog = useCallback(() => {
    setPermissionsDialogOpen(false);
    setPermissionsDialogProps(null);
  }, []);

  const [isAgentConfigDialogOpen, setIsAgentConfigDialogOpen] = useState(false);
  const [selectedAgentName, setSelectedAgentName] = useState<
    string | undefined
  >();
  const [selectedAgentDisplayName, setSelectedAgentDisplayName] = useState<
    string | undefined
  >();
  const [selectedAgentDefinition, setSelectedAgentDefinition] = useState<
    AgentDefinition | undefined
  >();

  const openAgentConfigDialog = useCallback(
    (name: string, displayName: string, definition: AgentDefinition) => {
      setSelectedAgentName(name);
      setSelectedAgentDisplayName(displayName);
      setSelectedAgentDefinition(definition);
      setIsAgentConfigDialogOpen(true);
    },
    [],
  );

  const closeAgentConfigDialog = useCallback(() => {
    setIsAgentConfigDialogOpen(false);
    setSelectedAgentName(undefined);
    setSelectedAgentDisplayName(undefined);
    setSelectedAgentDefinition(undefined);
  }, []);

  const toggleDebugProfiler = useCallback(
    () => setShowDebugProfiler((prev) => !prev),
    [],
  );

  const [currentModel, setCurrentModel] = useState(config.getModel());

  const [userTier, setUserTier] = useState<UserTierId | undefined>(undefined);
  const [quotaStats, setQuotaStats] = useState<QuotaStats | undefined>(() => {
    const remaining = config.getQuotaRemaining();
    const limit = config.getQuotaLimit();
    const resetTime = config.getQuotaResetTime();
    return remaining !== undefined ||
      limit !== undefined ||
      resetTime !== undefined
      ? { remaining, limit, resetTime }
      : undefined;
  });
  const [paidTier, setPaidTier] = useState<GeminiUserTier | undefined>(
    undefined,
  );

  const [isConfigInitialized, setConfigInitialized] = useState(false);

  const logger = useLogger(config);
  const { inputHistory, addInput, initializeFromLogger } =
    useInputHistoryStore();

  // Terminal and layout hooks
  const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();
  const { stdin, setRawMode } = useStdin();
  const { stdout } = useStdout();
  const app: AppProps = useApp();

  // Additional hooks moved from App.tsx
  const { stats: sessionStats } = useSessionStats();
  const branchName = useGitBranchName(config.getTargetDir());

  // Layout measurements
  // For performance profiling only
  const rootUiRef = useRef<DOMElement>(null);
  const lastTitleRef = useRef<string | null>(null);
  const staticExtraHeight = 3;

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      // Note: the program will not work if this fails so let errors be
      // handled by the global catch.
      if (!config.isInitialized()) {
        await config.initialize();
      }
      setConfigInitialized(true);
      startupProfiler.flush(config);

      // Fire-and-forget Auto Memory service (skill extraction from past sessions)
      if (config.isAutoMemoryEnabled()) {
        startMemoryService(config).catch((e) => {
          debugLogger.error('Failed to start memory service:', e);
        });
      }

      const sessionStartSource = resumedSessionData
        ? SessionStartSource.Resume
        : SessionStartSource.Startup;
      const result = await config
        .getHookSystem()
        ?.fireSessionStartEvent(sessionStartSource);

      if (result) {
        if (result.systemMessage) {
          historyManager.addItem(
            {
              type: MessageType.INFO,
              text: result.systemMessage,
            },
            Date.now(),
          );
        }

        const additionalContext = result.getAdditionalContext();
        const geminiClient = config.getGeminiClient();
        if (additionalContext && geminiClient) {
          await geminiClient.addHistory({
            role: 'user',
            parts: [
              { text: `<hook_context>${additionalContext}</hook_context>` },
            ],
          });
        }
      }

      // Fire-and-forget: generate summary for previous session in background
      generateSummary(config).catch((e) => {
        debugLogger.warn('Background summary generation failed:', e);
      });
    })();
    const cleanupFn = async () => {
      // Turn off mouse scroll.
      disableMouseEvents();

      // Kill all background shells
      await Promise.all(
        Array.from(backgroundTasksRef.current.keys()).map((pid) =>
          ShellExecutionService.kill(pid),
        ),
      );

      const ideClient = await IdeClient.getInstance();
      await ideClient.disconnect();

      // Fire SessionEnd hook on cleanup (only if hooks are enabled)
      await config?.getHookSystem()?.fireSessionEndEvent(SessionEndReason.Exit);
    };
    registerCleanup(cleanupFn);

    return () => {
      removeCleanup(cleanupFn);
      cleanupFn().catch((e: unknown) =>
        debugLogger.error('Error during cleanup:', e),
      );
    };
    // Disable the dependencies check here. historyManager gets flagged
    // but we don't want to react to changes to it because each new history
    // item, including the ones from the start session hook will cause a
    // re-render and an error when we try to reload config.
    //
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, resumedSessionData]);

  useEffect(
    () => setUpdateHandler(historyManager.addItem, setUpdateInfo),
    [historyManager.addItem],
  );

  // Subscribe to fallback mode and model changes from core
  useEffect(() => {
    const handleModelChanged = () => {
      setCurrentModel(config.getModel());
    };

    const handleQuotaChanged = (payload: {
      remaining: number | undefined;
      limit: number | undefined;
      resetTime?: string;
    }) => {
      setQuotaStats({
        remaining: payload.remaining,
        limit: payload.limit,
        resetTime: payload.resetTime,
      });
    };

    coreEvents.on(CoreEvent.ModelChanged, handleModelChanged);
    coreEvents.on(CoreEvent.QuotaChanged, handleQuotaChanged);
    return () => {
      coreEvents.off(CoreEvent.ModelChanged, handleModelChanged);
      coreEvents.off(CoreEvent.QuotaChanged, handleQuotaChanged);
    };
  }, [config]);

  useEffect(() => {
    const handleSettingsChanged = () => {
      setSettingsNonce((prev) => prev + 1);
    };

    const handleAdminSettingsChanged = () => {
      setAdminSettingsChanged(true);
    };

    const handleAgentsDiscovered = (payload: AgentsDiscoveredPayload) => {
      setNewAgents(payload.agents);
    };

    coreEvents.on(CoreEvent.SettingsChanged, handleSettingsChanged);
    coreEvents.on(CoreEvent.AdminSettingsChanged, handleAdminSettingsChanged);
    coreEvents.on(CoreEvent.AgentsDiscovered, handleAgentsDiscovered);
    return () => {
      coreEvents.off(CoreEvent.SettingsChanged, handleSettingsChanged);
      coreEvents.off(
        CoreEvent.AdminSettingsChanged,
        handleAdminSettingsChanged,
      );
      coreEvents.off(CoreEvent.AgentsDiscovered, handleAgentsDiscovered);
    };
  }, [settings]);

  const { errorCount, clearErrorCount } = useErrorCount();

  const mainAreaWidth = calculateMainAreaWidth(terminalWidth, config);
  // Derive widths for InputPrompt using shared helper
  const { inputWidth, suggestionsWidth } = useMemo(() => {
    const { inputWidth, suggestionsWidth } =
      calculatePromptWidths(mainAreaWidth);
    return { inputWidth, suggestionsWidth };
  }, [mainAreaWidth]);

  const staticAreaMaxItemHeight = Math.max(terminalHeight * 4, 100);

  const getPreferredEditor = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    () => settings.merged.general.preferredEditor as EditorType,
    [settings.merged.general.preferredEditor],
  );

  const buffer = useTextBuffer({
    initialText: '',
    viewport: { height: 10, width: inputWidth },
    stdin,
    setRawMode,
    escapePastedPaths: true,
    shellModeActive,
    getPreferredEditor,
  });
  const bufferRef = useRef(buffer);
  useEffect(() => {
    bufferRef.current = buffer;
  }, [buffer]);

  const stableSetText = useCallback((text: string) => {
    bufferRef.current.setText(text);
  }, []);

  // Initialize input history from logger (past sessions)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    initializeFromLogger(logger);
  }, [logger, initializeFromLogger]);

  // One-time prompt to suggest running /terminal-setup when it would help.
  useTerminalSetupPrompt({
    addConfirmUpdateExtensionRequest,
    addItem: historyManager.addItem,
  });

  const refreshStatic = useCallback(() => {
    if (!isAlternateBuffer && !config.getUseTerminalBuffer()) {
      stdout.write(ansiEscapes.clearTerminal);
      setHistoryRemountKey((prev) => prev + 1);
    }
  }, [setHistoryRemountKey, isAlternateBuffer, stdout, config]);

  const shouldUseAlternateScreen = shouldEnterAlternateScreen(
    isAlternateBuffer,
    config.getScreenReader(),
  );

  const handleEditorClose = useCallback(() => {
    if (shouldUseAlternateScreen) {
      // The editor may have exited alternate buffer mode so we need to
      // enter it again to be safe.
      enterAlternateScreen();
      enableMouseEvents();
      disableLineWrapping();
      app.rerender();
    }
    terminalCapabilityManager.enableSupportedModes();
    refreshStatic();
  }, [refreshStatic, shouldUseAlternateScreen, app]);

  const [editorError, setEditorError] = useState<string | null>(null);
  const {
    isEditorDialogOpen,
    openEditorDialog,
    handleEditorSelect,
    exitEditorDialog,
  } = useEditorSettings(settings, setEditorError, historyManager.addItem);

  useEffect(() => {
    coreEvents.on(CoreEvent.ExternalEditorClosed, handleEditorClose);
    coreEvents.on(CoreEvent.RequestEditorSelection, openEditorDialog);
    return () => {
      coreEvents.off(CoreEvent.ExternalEditorClosed, handleEditorClose);
      coreEvents.off(CoreEvent.RequestEditorSelection, openEditorDialog);
    };
  }, [handleEditorClose, openEditorDialog]);

  useEffect(() => {
    if (
      !(settings.merged.ui.hideBanner || config.getScreenReader()) &&
      bannerVisible &&
      bannerText
    ) {
      // The header should show a banner but the Header is rendered in static
      // so we must trigger a static refresh for it to be visible.
      refreshStatic();
    }
  }, [bannerVisible, bannerText, settings, config, refreshStatic]);

  const { isSettingsDialogOpen, openSettingsDialog, closeSettingsDialog } =
    useSettingsCommand();

  const {
    isThemeDialogOpen,
    openThemeDialog,
    closeThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  } = useThemeCommand(
    settings,
    setThemeError,
    historyManager.addItem,
    initializationResult.themeError,
    refreshStatic,
  );
  // Poll for terminal background color changes to auto-switch theme
  useTerminalTheme(handleThemeSelect, config, refreshStatic);
  const {
    authState,
    setAuthState,
    authError,
    onAuthError,
    apiKeyDefaultValue,
    reloadApiKey,
    accountSuspensionInfo,
    setAccountSuspensionInfo,
  } = useAuthCommand(
    settings,
    config,
    initializationResult.authError,
    initializationResult.accountSuspensionInfo,
  );
  const [authContext, setAuthContext] = useState<{ requiresRestart?: boolean }>(
    {},
  );

  useEffect(() => {
    if (authState === AuthState.Authenticated && authContext.requiresRestart) {
      setAuthState(AuthState.AwaitingGoogleLoginRestart);
      setAuthContext({});
    }
  }, [authState, authContext, setAuthState]);

  const {
    proQuotaRequest,
    handleProQuotaChoice,
    validationRequest,
    handleValidationChoice,
    // G1 AI Credits
    overageMenuRequest,
    handleOverageMenuChoice,
    emptyWalletRequest,
    handleEmptyWalletChoice,
  } = useQuotaAndFallback({
    config,
    historyManager,
    userTier,
    paidTier,
    settings,
    setModelSwitchedFromQuotaError,
    onShowAuthSelection: () => setAuthState(AuthState.Updating),
    errorVerbosity: settings.merged.ui.errorVerbosity,
  });

  // Derive auth state variables for backward compatibility with UIStateContext
  const isAuthDialogOpen = authState === AuthState.Updating;
  // TODO: Consider handling other auth types that should also skip the blocking screen
  const isAuthenticating =
    authState === AuthState.Unauthenticated &&
    settings.merged.security.auth.selectedType !== AuthType.USE_GEMINI;

  // Session browser and resume functionality
  const isGeminiClientInitialized = config.getGeminiClient()?.isInitialized();

  const { loadHistoryForResume, isResuming } = useSessionResume({
    config,
    historyManager,
    refreshStatic,
    isGeminiClientInitialized,
    setQuittingMessages,
    resumedSessionData,
    isAuthenticating,
  });
  const {
    isSessionBrowserOpen,
    openSessionBrowser,
    closeSessionBrowser,
    handleResumeSession,
    handleDeleteSession: handleDeleteSessionSync,
  } = useSessionBrowser(config, loadHistoryForResume);
  // Wrap handleDeleteSession to return a Promise for UIActions interface
  const handleDeleteSession = useCallback(
    async (session: SessionInfo): Promise<void> => {
      await handleDeleteSessionSync(session);
    },
    [handleDeleteSessionSync],
  );

  // Create handleAuthSelect wrapper for backward compatibility
  const handleAuthSelect = useCallback(
    async (authType: AuthType | undefined, scope: LoadableSettingScope) => {
      if (authType) {
        const previousAuthType =
          config.getContentGeneratorConfig()?.authType ?? 'unknown';
        if (authType === AuthType.LOGIN_WITH_GOOGLE) {
          setAuthContext({ requiresRestart: true });
        } else {
          setAuthContext({});
        }
        await clearCachedCredentialFile();
        settings.setValue(scope, 'security.auth.selectedType', authType);

        try {
          config.setRemoteAdminSettings(undefined);
          await config.refreshAuth(authType);
          setAuthState(AuthState.Authenticated);
          logBillingEvent(
            config,
            new ApiKeyUpdatedEvent(previousAuthType, authType),
          );
        } catch (e) {
          if (e instanceof ChangeAuthRequestedError) {
            return;
          }
          if (e instanceof ProjectIdRequiredError) {
            // OAuth succeeded but account setup requires project ID
            // Show the error message directly without "Failed to authenticate" prefix
            onAuthError(getErrorMessage(e));
            return;
          }
          onAuthError(
            `Failed to authenticate: ${e instanceof Error ? e.message : String(e)}`,
          );
          return;
        }

        if (
          authType === AuthType.LOGIN_WITH_GOOGLE &&
          config.isBrowserLaunchSuppressed()
        ) {
          writeToStdout(`
----------------------------------------------------------------
Logging in with Google... Restarting Gemini CLI to continue.
----------------------------------------------------------------
          `);
          await relaunchApp();
        }
      }
      setAuthState(AuthState.Authenticated);
    },
    [settings, config, setAuthState, onAuthError, setAuthContext],
  );

  const handleApiKeySubmit = useCallback(
    async (apiKey: string) => {
      try {
        onAuthError(null);
        if (!apiKey.trim() && apiKey.length > 1) {
          onAuthError(
            'API key cannot be empty string with length greater than 1.',
          );
          return;
        }

        await saveApiKey(apiKey);
        await reloadApiKey();
        await config.refreshAuth(AuthType.USE_GEMINI);
        setAuthState(AuthState.Authenticated);
      } catch (e) {
        onAuthError(
          `Failed to save API key: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    [setAuthState, onAuthError, reloadApiKey, config],
  );

  const handleApiKeyCancel = useCallback(() => {
    // Go back to auth method selection
    setAuthState(AuthState.Updating);
  }, [setAuthState]);

  // Sync user tier from config when authentication changes
  useEffect(() => {
    // Only sync when not currently authenticating
    if (authState === AuthState.Authenticated) {
      setUserTier(config.getUserTier());
      setPaidTier(config.getUserPaidTier());
    }
  }, [config, authState]);

  // Check for enforced auth type mismatch
  useEffect(() => {
    if (
      settings.merged.security.auth.enforcedType &&
      settings.merged.security.auth.selectedType &&
      settings.merged.security.auth.enforcedType !==
        settings.merged.security.auth.selectedType
    ) {
      onAuthError(
        `Authentication is enforced to be ${settings.merged.security.auth.enforcedType}, but you are currently using ${settings.merged.security.auth.selectedType}.`,
      );
    } else if (
      settings.merged.security.auth.selectedType &&
      !settings.merged.security.auth.useExternal
    ) {
      // We skip validation for Gemini API key here because it might be stored
      // in the keychain, which we can't check synchronously.
      // The useAuth hook handles validation for this case.
      if (settings.merged.security.auth.selectedType === AuthType.USE_GEMINI) {
        return;
      }

      const error = validateAuthMethod(
        settings.merged.security.auth.selectedType,
      );
      if (error) {
        onAuthError(error);
      }
    }
  }, [
    settings.merged.security.auth.selectedType,
    settings.merged.security.auth.enforcedType,
    settings.merged.security.auth.useExternal,
    onAuthError,
  ]);

  const { isModelDialogOpen, openModelDialog, closeModelDialog } =
    useModelCommand();

  const { toggleVimEnabled } = useVimMode();

  const setIsBackgroundTaskListOpenRef = useRef<(open: boolean) => void>(
    () => {},
  );
  const [shortcutsHelpVisible, setShortcutsHelpVisible] = useState(false);

  const {
    cleanUiDetailsVisible,
    setCleanUiDetailsVisible,
    toggleCleanUiDetailsVisible,
    revealCleanUiDetailsTemporarily,
  } = useVisibilityToggle();

  const slashCommandActions = useMemo(
    () => ({
      openAuthDialog: () => setAuthState(AuthState.Updating),
      openThemeDialog,
      openEditorDialog,
      openPrivacyNotice: () => setShowPrivacyNotice(true),
      openSettingsDialog,
      openSessionBrowser,
      openModelDialog,
      openAgentConfigDialog,
      openPermissionsDialog,
      quit: (messages: HistoryItem[]) => {
        closeThemeDialog();
        setQuittingMessages(messages);
        setTimeout(async () => {
          await runExitCleanup();
          process.exit(0);
        }, 100);
      },
      setDebugMessage,
      toggleCorgiMode: () => setCorgiMode((prev) => !prev),
      toggleDebugProfiler,
      dispatchExtensionStateUpdate,
      addConfirmUpdateExtensionRequest,
      toggleBackgroundTasks: () => {
        toggleBackgroundTasksRef.current();
        if (!isBackgroundTaskVisibleRef.current) {
          setEmbeddedShellFocused(true);
          if (backgroundTasksRef.current.size > 1) {
            setIsBackgroundTaskListOpenRef.current(true);
          } else {
            setIsBackgroundTaskListOpenRef.current(false);
          }
        }
      },
      toggleShortcutsHelp: () => setShortcutsHelpVisible((visible) => !visible),
      setText: stableSetText,
    }),
    [
      setAuthState,
      openThemeDialog,
      closeThemeDialog,
      openEditorDialog,
      openSettingsDialog,
      openSessionBrowser,
      openModelDialog,
      openAgentConfigDialog,
      setQuittingMessages,
      setDebugMessage,
      setShowPrivacyNotice,
      setCorgiMode,
      dispatchExtensionStateUpdate,
      openPermissionsDialog,
      addConfirmUpdateExtensionRequest,
      toggleDebugProfiler,
      setShortcutsHelpVisible,
      stableSetText,
    ],
  );

  const {
    handleSlashCommand,
    slashCommands,
    pendingHistoryItems: pendingSlashCommandHistoryItems,
    commandContext,
    confirmationRequest: commandConfirmationRequest,
  } = useSlashCommandProcessor(
    config,
    settings,
    historyManager.addItem,
    historyManager.clearItems,
    historyManager.loadHistory,
    refreshStatic,
    toggleVimEnabled,
    setIsProcessing,
    slashCommandActions,
    extensionsUpdateStateInternal,
    isConfigInitialized,
    setBannerVisible,
    setCustomDialog,
  );

  const [authConsentRequest, setAuthConsentRequest] =
    useState<ConfirmationRequest | null>(null);
  const [permissionConfirmationRequest, setPermissionConfirmationRequest] =
    useState<PermissionConfirmationRequest | null>(null);

  useEffect(() => {
    const handleConsentRequest = (payload: ConsentRequestPayload) => {
      setAuthConsentRequest({
        prompt: payload.prompt,
        onConfirm: (confirmed: boolean) => {
          setAuthConsentRequest(null);
          payload.onConfirm(confirmed);
        },
      });
    };

    coreEvents.on(CoreEvent.ConsentRequest, handleConsentRequest);
    return () => {
      coreEvents.off(CoreEvent.ConsentRequest, handleConsentRequest);
    };
  }, []);

  const performMemoryRefresh = useCallback(async () => {
    historyManager.addItem(
      {
        type: MessageType.INFO,
        text: 'Refreshing hierarchical memory (GEMINI.md or other context files)...',
      },
      Date.now(),
    );
    try {
      let flattenedMemory: string;
      let fileCount: number;

      if (config.isJitContextEnabled()) {
        await config.getMemoryContextManager()?.refresh();
        config.updateSystemInstructionIfInitialized();
        flattenedMemory = flattenMemory(config.getUserMemory());
        fileCount = config.getGeminiMdFileCount();
      } else {
        const result = await refreshServerHierarchicalMemory(config);
        flattenedMemory = flattenMemory(result.memoryContent);
        fileCount = result.fileCount;
      }

      historyManager.addItem(
        {
          type: MessageType.INFO,
          text: `Memory reloaded successfully. ${
            flattenedMemory.length > 0
              ? `Loaded ${flattenedMemory.length} characters from ${fileCount} file(s)`
              : 'No memory content found'
          }`,
        },
        Date.now(),
      );
      if (config.getDebugMode()) {
        debugLogger.log(
          `[DEBUG] Refreshed memory content in config: ${flattenedMemory.substring(
            0,
            200,
          )}...`,
        );
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      historyManager.addItem(
        {
          type: MessageType.ERROR,
          text: `Error refreshing memory: ${errorMessage}`,
        },
        Date.now(),
      );
      debugLogger.warn('Error refreshing memory:', error);
    }
  }, [config, historyManager]);

  const cancelHandlerRef = useRef<(shouldRestorePrompt?: boolean) => void>(
    () => {},
  );

  const onCancelSubmit = useCallback((shouldRestorePrompt?: boolean) => {
    if (shouldRestorePrompt) {
      setPendingRestorePrompt(true);
    } else {
      setPendingRestorePrompt(false);
      cancelHandlerRef.current(false);
    }
  }, []);

  useEffect(() => {
    if (pendingRestorePrompt) {
      const lastHistoryUserMsg = historyManager.history.findLast(
        (h) => h.type === 'user',
      );
      const lastUserMsg = inputHistory.at(-1);

      if (
        !lastHistoryUserMsg ||
        (typeof lastHistoryUserMsg.text === 'string' &&
          lastHistoryUserMsg.text === lastUserMsg)
      ) {
        cancelHandlerRef.current(true);
        setPendingRestorePrompt(false);
      }
    }
  }, [pendingRestorePrompt, inputHistory, historyManager.history]);

  const pendingHintsRef = useRef<string[]>([]);
  const [pendingHintCount, setPendingHintCount] = useState(0);

  const consumePendingHints = useCallback(() => {
    if (pendingHintsRef.current.length === 0) {
      return null;
    }
    const hint = pendingHintsRef.current.join('\n');
    pendingHintsRef.current = [];
    setPendingHintCount(0);
    return hint;
  }, []);

  useEffect(() => {
    const hintListener = (text: string, source: InjectionSource) => {
      if (source !== 'user_steering' && source !== 'background_completion') {
        return;
      }
      pendingHintsRef.current.push(text);
      setPendingHintCount((prev) => prev + 1);
    };
    config.injectionService.onInjection(hintListener);
    return () => {
      config.injectionService.offInjection(hintListener);
    };
  }, [config]);

  const streamAgent = useMemo(
    () =>
      config?.getAgentSessionInteractiveEnabled()
        ? new LegacyAgentProtocol({ config, getPreferredEditor })
        : undefined,
    [config, getPreferredEditor],
  );

  const activeStream = streamAgent
    ? // eslint-disable-next-line react-hooks/rules-of-hooks
      useAgentStream({
        agent: streamAgent,
        addItem: historyManager.addItem,
        onCancelSubmit,
        isShellFocused: embeddedShellFocused,
        logger,
      })
    : // eslint-disable-next-line react-hooks/rules-of-hooks
      useGeminiStream(
        config.getGeminiClient(),
        historyManager.history,
        historyManager.addItem,
        config,
        settings,
        setDebugMessage,
        handleSlashCommand,
        shellModeActive,
        getPreferredEditor,
        onAuthError,
        performMemoryRefresh,
        modelSwitchedFromQuotaError,
        setModelSwitchedFromQuotaError,
        onCancelSubmit,
        setEmbeddedShellFocused,
        terminalWidth,
        terminalHeight,
        embeddedShellFocused,
        consumePendingHints,
      );

  const {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems: pendingGeminiHistoryItems,
    thought,
    cancelOngoingRequest,
    pendingToolCalls,
    handleApprovalModeChange,
    activePtyId,
    loopDetectionConfirmationRequest,
    lastOutputTime,
    backgroundTaskCount,
    isBackgroundTaskVisible,
    toggleBackgroundTasks,
    backgroundCurrentExecution,
    backgroundTasks,
    dismissBackgroundTask,
    retryStatus,
  } = activeStream;

  const pendingHistoryItems = useMemo(
    () => [...pendingSlashCommandHistoryItems, ...pendingGeminiHistoryItems],
    [pendingSlashCommandHistoryItems, pendingGeminiHistoryItems],
  );

  toggleBackgroundTasksRef.current = toggleBackgroundTasks;
  isBackgroundTaskVisibleRef.current = isBackgroundTaskVisible;
  backgroundTasksRef.current = backgroundTasks;

  const {
    activeBackgroundTaskPid,
    setIsBackgroundTaskListOpen,
    isBackgroundTaskListOpen,
    setActiveBackgroundTaskPid,
    backgroundTaskHeight,
  } = useBackgroundTaskManager({
    backgroundTasks,
    backgroundTaskCount,
    isBackgroundTaskVisible,
    activePtyId,
    embeddedShellFocused,
    setEmbeddedShellFocused,
    terminalHeight,
  });

  setIsBackgroundTaskListOpenRef.current = setIsBackgroundTaskListOpen;

  const lastOutputTimeRef = useRef(0);

  useEffect(() => {
    lastOutputTimeRef.current = lastOutputTime;
  }, [lastOutputTime]);

  const { shouldShowFocusHint, inactivityStatus } = useShellInactivityStatus({
    activePtyId,
    lastOutputTime,
    streamingState,
    pendingToolCalls,
    embeddedShellFocused,
    isInteractiveShellEnabled: config.isInteractiveShellEnabled(),
  });

  const shouldShowActionRequiredTitle = inactivityStatus === 'action_required';
  const shouldShowSilentWorkingTitle = inactivityStatus === 'silent_working';

  const handleApprovalModeChangeWithUiReveal = useCallback(
    (mode: ApprovalMode) => {
      void handleApprovalModeChange(mode);
      if (!cleanUiDetailsVisible) {
        revealCleanUiDetailsTemporarily(APPROVAL_MODE_REVEAL_DURATION_MS);
      }
    },
    [
      handleApprovalModeChange,
      cleanUiDetailsVisible,
      revealCleanUiDetailsTemporarily,
    ],
  );

  const { isMcpReady } = useMcpStatus(config);

  const {
    messageQueue,
    addMessage,
    clearQueue,
    getQueuedMessagesText,
    popAllMessages,
  } = useMessageQueue({
    isConfigInitialized,
    streamingState,
    submitQuery,
    isMcpReady,
  });

  cancelHandlerRef.current = useCallback(
    (shouldRestorePrompt: boolean = true) => {
      if (isToolAwaitingConfirmation(pendingHistoryItems)) {
        return; // Don't clear - user may be composing a follow-up message
      }
      if (isToolExecuting(pendingHistoryItems)) {
        buffer.setText(''); // Clear for Ctrl+C cancellation
        return;
      }

      // If cancelling (shouldRestorePrompt=false), never modify the buffer
      // User is in control - preserve whatever text they typed, pasted, or restored
      if (!shouldRestorePrompt) {
        return;
      }

      // Restore the last message when shouldRestorePrompt=true
      const lastUserMessage = inputHistory.at(-1);
      let textToSet = lastUserMessage || '';

      const queuedText = getQueuedMessagesText();
      if (queuedText) {
        textToSet = textToSet ? `${textToSet}\n\n${queuedText}` : queuedText;
        clearQueue();
      }

      if (textToSet) {
        buffer.setText(textToSet);
      }
    },
    [
      buffer,
      inputHistory,
      getQueuedMessagesText,
      clearQueue,
      pendingHistoryItems,
    ],
  );

  const handleHintSubmit = useCallback(
    (hint: string) => {
      const trimmed = hint.trim();
      if (!trimmed) {
        return;
      }
      config.injectionService.addInjection(trimmed, 'user_steering');
      // Render hints with a distinct style.
      historyManager.addItem({
        type: 'hint',
        text: trimmed,
      });
    },
    [config, historyManager],
  );

  const handleFinalSubmit = useCallback(
    async (submittedValue: string) => {
      reset();
      // Explicitly hide the expansion hint and clear its x-second timer when a new turn begins.
      triggerExpandHint(null);
      if (!constrainHeight) {
        setConstrainHeight(true);
        if (!isAlternateBuffer) {
          refreshStatic();
        }
      }

      const isSlash = isSlashCommand(submittedValue.trim());
      const isIdle = streamingState === StreamingState.Idle;
      const isAgentRunning =
        streamingState === StreamingState.Responding ||
        isToolExecuting(pendingHistoryItems);

      if (isSlash && isAgentRunning) {
        const { commandToExecute } = parseSlashCommand(
          submittedValue,
          slashCommands ?? [],
        );
        if (commandToExecute?.isSafeConcurrent) {
          void handleSlashCommand(submittedValue);
          addInput(submittedValue);
          return;
        }
      }

      if (config.isModelSteeringEnabled() && isAgentRunning && !isSlash) {
        handleHintSubmit(submittedValue);
        addInput(submittedValue);
        return;
      }

      const isMcpOrConfigReady = isConfigInitialized && isMcpReady;
      if ((isSlash && isConfigInitialized) || (isIdle && isMcpOrConfigReady)) {
        if (!isSlash) {
          const permissions = await checkPermissions(submittedValue, config);
          if (permissions.length > 0) {
            setPermissionConfirmationRequest({
              files: permissions,
              onComplete: (result) => {
                setPermissionConfirmationRequest(null);
                if (result.allowed) {
                  permissions.forEach((p) =>
                    config.getWorkspaceContext().addReadOnlyPath(p),
                  );
                }
                void submitQuery(submittedValue);
              },
            });
            addInput(submittedValue);
            return;
          }
        }
        void submitQuery(submittedValue);
      } else {
        // Check messageQueue.length === 0 to only notify on the first queued item
        if (isIdle && !isMcpOrConfigReady && messageQueue.length === 0) {
          coreEvents.emitFeedback(
            'info',
            !isConfigInitialized
              ? 'Initializing... Prompts will be queued.'
              : 'Waiting for MCP servers to initialize... Slash commands are still available and prompts will be queued.',
          );
        }
        addMessage(submittedValue);
      }
      addInput(submittedValue); // Track input for up-arrow history
    },
    [
      addMessage,
      addInput,
      submitQuery,
      handleSlashCommand,
      slashCommands,
      isMcpReady,
      streamingState,
      messageQueue.length,
      pendingHistoryItems,
      config,
      constrainHeight,
      setConstrainHeight,
      isAlternateBuffer,
      refreshStatic,
      reset,
      handleHintSubmit,
      isConfigInitialized,
      triggerExpandHint,
    ],
  );

  const handleClearScreen = useCallback(() => {
    reset();
    // Explicitly hide the expansion hint and clear its x-second timer when clearing the screen.
    triggerExpandHint(null);
    historyManager.clearItems();
    clearErrorCount();
    refreshStatic();
  }, [
    historyManager,
    clearErrorCount,
    refreshStatic,
    reset,
    triggerExpandHint,
  ]);

  const { handleInput: vimHandleInput } = useVim(buffer, handleFinalSubmit);

  /**
   * Determines if the input prompt should be active and accept user input.
   * Input is disabled during:
   * - Initialization errors
   * - Slash command processing
   * - Tool confirmations (WaitingForConfirmation state)
   * - Any future streaming states not explicitly allowed
   */
  const isInputActive =
    !initError &&
    !isProcessing &&
    !isResuming &&
    (streamingState === StreamingState.Idle ||
      streamingState === StreamingState.Responding ||
      streamingState === StreamingState.WaitingForConfirmation) &&
    !proQuotaRequest;

  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
    },
    [],
  );

  const [controlsHeight, setControlsHeight] = useState(0);
  const [lastNonCopyControlsHeight, setLastNonCopyControlsHeight] = useState(0);

  useLayoutEffect(() => {
    if (!copyModeEnabled && controlsHeight > 0) {
      setLastNonCopyControlsHeight(controlsHeight);
    }
  }, [copyModeEnabled, controlsHeight]);

  const stableControlsHeight =
    copyModeEnabled && lastNonCopyControlsHeight > 0
      ? lastNonCopyControlsHeight
      : controlsHeight;

  const mainControlsRef = useCallback((node: DOMElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (node) {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const roundedHeight = Math.round(entry.contentRect.height);
          setControlsHeight((prev) =>
            roundedHeight !== prev ? roundedHeight : prev,
          );
        }
      });
      observer.observe(node);
      observerRef.current = observer;
    }
  }, []);

  // Compute available terminal height based on stable controls measurement
  const availableTerminalHeight = Math.max(
    0,
    terminalHeight - stableControlsHeight - backgroundTaskHeight - 1,
  );

  config.setShellExecutionConfig({
    terminalWidth: Math.floor(terminalWidth * SHELL_WIDTH_FRACTION),
    terminalHeight: Math.max(
      Math.floor(availableTerminalHeight - SHELL_HEIGHT_PADDING),
      1,
    ),
    pager: settings.merged.tools.shell.pager,
    showColor: settings.merged.tools.shell.showColor,
    sanitizationConfig: config.sanitizationConfig,
    sandboxManager: config.sandboxManager,
  });

  const { isFocused, hasReceivedFocusEvent } = useFocus();

  // Context file names computation
  const contextFileNames = useMemo(() => {
    const fromSettings = settings.merged.context.fileName;
    return fromSettings
      ? Array.isArray(fromSettings)
        ? fromSettings
        : [fromSettings]
      : getAllGeminiMdFilenames();
  }, [settings.merged.context.fileName]);
  // Initial prompt handling
  const initialPrompt = useMemo(() => config.getQuestion(), [config]);
  const initialPromptSubmitted = useRef(false);
  const geminiClient = config.getGeminiClient();

  useEffect(() => {
    if (
      initialPrompt &&
      isConfigInitialized &&
      !initialPromptSubmitted.current &&
      !isAuthenticating &&
      !isAuthDialogOpen &&
      !isThemeDialogOpen &&
      !isEditorDialogOpen &&
      !showPrivacyNotice &&
      geminiClient?.isInitialized?.()
    ) {
      void handleFinalSubmit(initialPrompt);
      initialPromptSubmitted.current = true;
    }
  }, [
    initialPrompt,
    isConfigInitialized,
    handleFinalSubmit,
    isAuthenticating,
    isAuthDialogOpen,
    isThemeDialogOpen,
    isEditorDialogOpen,
    showPrivacyNotice,
    geminiClient,
  ]);

  const [idePromptAnswered, setIdePromptAnswered] = useState(false);
  const [currentIDE, setCurrentIDE] = useState<IdeInfo | null>(null);

  useEffect(() => {
    const getIde = async () => {
      const ideClient = await IdeClient.getInstance();
      const currentIde = ideClient.getCurrentIde();
      setCurrentIDE(currentIde || null);
    };
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    getIde();
  }, []);
  const shouldShowIdePrompt = Boolean(
    currentIDE &&
      !config.getIdeMode() &&
      !settings.merged.ide.hasSeenNudge &&
      !idePromptAnswered,
  );

  const [showErrorDetails, setShowErrorDetails] = useState<boolean>(false);
  const [showFullTodos, setShowFullTodos] = useState<boolean>(false);
  const [renderMarkdown, setRenderMarkdown] = useState<boolean>(true);

  const handleExitRepeat = useCallback(
    (count: number) => {
      if (count > 2) {
        recordExitFail(config);
      }
      if (count > 1) {
        void handleSlashCommand('/quit', undefined, undefined, false);
      }
    },
    [config, handleSlashCommand],
  );

  const { pressCount: ctrlCPressCount, handlePress: handleCtrlCPress } =
    useRepeatedKeyPress({
      windowMs: WARNING_PROMPT_DURATION_MS,
      onRepeat: handleExitRepeat,
    });

  const { pressCount: ctrlDPressCount, handlePress: handleCtrlDPress } =
    useRepeatedKeyPress({
      windowMs: WARNING_PROMPT_DURATION_MS,
      onRepeat: handleExitRepeat,
    });

  const [ideContextState, setIdeContextState] = useState<
    IdeContext | undefined
  >();
  const [showEscapePrompt, setShowEscapePrompt] = useState(false);
  const [showIdeRestartPrompt, setShowIdeRestartPrompt] = useState(false);

  const [transientMessage, showTransientMessage] = useTimedMessage<{
    text: string;
    type: TransientMessageType;
  }>(WARNING_PROMPT_DURATION_MS);

  const {
    isFolderTrustDialogOpen,
    discoveryResults: folderDiscoveryResults,
    handleFolderTrustSelect,
    isRestarting,
  } = useFolderTrust(settings, setIsTrustedFolder, historyManager.addItem);

  const policyUpdateConfirmationRequest =
    config.getPolicyUpdateConfirmationRequest();
  const [isPolicyUpdateDialogOpen, setIsPolicyUpdateDialogOpen] = useState(
    !!policyUpdateConfirmationRequest,
  );
  const {
    needsRestart: ideNeedsRestart,
    restartReason: ideTrustRestartReason,
  } = useIdeTrustListener();
  const isInitialMount = useRef(true);

  useIncludeDirsTrust(config, isTrustedFolder, historyManager, setCustomDialog);

  const tabFocusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleTransientMessage = (payload: {
      message: string;
      type: TransientMessageType;
    }) => {
      showTransientMessage({ text: payload.message, type: payload.type });
    };

    const handleSelectionWarning = () => {
      showTransientMessage({
        text: 'Press Ctrl-S to enter selection mode to copy text.',
        type: TransientMessageType.Warning,
      });
    };
    const handlePasteTimeout = () => {
      showTransientMessage({
        text: 'Paste Timed out. Possibly due to slow connection.',
        type: TransientMessageType.Warning,
      });
    };

    appEvents.on(AppEvent.TransientMessage, handleTransientMessage);
    appEvents.on(AppEvent.SelectionWarning, handleSelectionWarning);
    appEvents.on(AppEvent.PasteTimeout, handlePasteTimeout);

    return () => {
      appEvents.off(AppEvent.TransientMessage, handleTransientMessage);
      appEvents.off(AppEvent.SelectionWarning, handleSelectionWarning);
      appEvents.off(AppEvent.PasteTimeout, handlePasteTimeout);
      if (tabFocusTimeoutRef.current) {
        clearTimeout(tabFocusTimeoutRef.current);
      }
    };
  }, [showTransientMessage]);

  const handleWarning = useCallback(
    (message: string) => {
      showTransientMessage({
        text: message,
        type: TransientMessageType.Warning,
      });
    },
    [showTransientMessage],
  );

  const { handleSuspend } = useSuspend({
    handleWarning,
    setRawMode,
    refreshStatic,
    setForceRerenderKey,
    shouldUseAlternateScreen,
  });

  useEffect(() => {
    if (ideNeedsRestart) {
      // IDE trust changed, force a restart.
      setShowIdeRestartPrompt(true);
    }
  }, [ideNeedsRestart]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const handler = setTimeout(() => {
      refreshStatic();
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [terminalWidth, refreshStatic]);

  useEffect(() => {
    const unsubscribe = ideContextStore.subscribe(setIdeContextState);
    setIdeContextState(ideContextStore.get());
    return unsubscribe;
  }, []);

  useEffect(() => {
    const openDebugConsole = () => {
      setShowErrorDetails(true);
      setConstrainHeight(false);
    };
    appEvents.on(AppEvent.OpenDebugConsole, openDebugConsole);

    return () => {
      appEvents.off(AppEvent.OpenDebugConsole, openDebugConsole);
    };
  }, [config]);

  const handleEscapePromptChange = useCallback((showPrompt: boolean) => {
    setShowEscapePrompt(showPrompt);
  }, []);

  const handleIdePromptComplete = useCallback(
    (result: IdeIntegrationNudgeResult) => {
      if (result.userSelection === 'yes') {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handleSlashCommand('/ide install');
        settings.setValue(SettingScope.User, 'ide.hasSeenNudge', true);
      } else if (result.userSelection === 'dismiss') {
        settings.setValue(SettingScope.User, 'ide.hasSeenNudge', true);
      }
      setIdePromptAnswered(true);
    },
    [handleSlashCommand, settings],
  );

  const handleGlobalKeypress = useCallback(
    (key: Key): boolean => {
      // Debug log keystrokes if enabled
      if (settings.merged.general.debugKeystrokeLogging) {
        debugLogger.log('[DEBUG] Keystroke:', JSON.stringify(key));
      }

      if (shortcutsHelpVisible && isHelpDismissKey(key)) {
        setShortcutsHelpVisible(false);
      }

      if (keyMatchers[Command.TOGGLE_MOUSE_MODE](key)) {
        setMouseMode((prev) => !prev);
        if (mouseMode && !isAlternateBuffer) {
          appEvents.emit(AppEvent.ScrollToBottom);
        }
        return true;
      }

      if (isAlternateBuffer && keyMatchers[Command.TOGGLE_COPY_MODE](key)) {
        setCopyModeEnabled(true);
        disableMouseEvents();
        return true;
      }

      if (keyMatchers[Command.QUIT](key)) {
        // If the user presses Ctrl+C, we want to cancel any ongoing requests.
        // This should happen regardless of the count.
        void cancelOngoingRequest?.();

        handleCtrlCPress();
        return true;
      } else if (keyMatchers[Command.EXIT](key)) {
        // If the input field is non-empty, do not exit.
        if (bufferRef.current.text.length > 0) {
          return false;
        }
        handleCtrlDPress();
        return true;
      } else if (keyMatchers[Command.SUSPEND_APP](key)) {
        handleSuspend();
      } else if (keyMatchers[Command.DUMP_FRAME](key)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `snapshot-${timestamp}.json`;
        if (dumpCurrentFrame) {
          dumpCurrentFrame(filename);
          debugLogger.log(`Dumped frame to: ${filename}`);
        }
        return true;
      } else if (keyMatchers[Command.START_RECORDING](key)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `recording-${timestamp}.json`;
        if (startRecording) {
          startRecording(filename);
          recordingFilenameRef.current = filename;
          debugLogger.log(`Started recording to: ${filename}`);
        }
        return true;
      } else if (keyMatchers[Command.STOP_RECORDING](key)) {
        if (stopRecording) {
          stopRecording();
          debugLogger.log(
            `Stopped recording, saved to: ${recordingFilenameRef.current ?? 'unknown'}`,
          );
          recordingFilenameRef.current = null;
        }
        return true;
      } else if (
        keyMatchers[Command.TOGGLE_COPY_MODE](key) &&
        !isAlternateBuffer
      ) {
        showTransientMessage({
          text: 'Use Ctrl+O to expand and collapse blocks of content.',
          type: TransientMessageType.Warning,
        });
        return true;
      }

      const toggleLastTurnTools = () => {
        triggerExpandHint(true);

        const targetToolCallIds = getLastTurnToolCallIds(
          historyManager.history,
          pendingHistoryItems,
        );

        if (targetToolCallIds.length > 0) {
          toggleAllExpansion(targetToolCallIds);
        }
      };

      let enteringConstrainHeightMode = false;
      if (!constrainHeight) {
        enteringConstrainHeightMode = true;
        setConstrainHeight(true);
        if (keyMatchers[Command.SHOW_MORE_LINES](key)) {
          toggleLastTurnTools();
        }
        if (!isAlternateBuffer) {
          refreshStatic();
        }
      }

      if (keyMatchers[Command.SHOW_ERROR_DETAILS](key)) {
        if (settings.merged.general.devtools) {
          void (async () => {
            const { toggleDevToolsPanel } = await import(
              '../utils/devtoolsService.js'
            );
            await toggleDevToolsPanel(
              config,
              showErrorDetails,
              () => setShowErrorDetails((prev) => !prev),
              () => setShowErrorDetails(true),
            );
          })();
        } else {
          setShowErrorDetails((prev) => !prev);
        }
        return true;
      } else if (keyMatchers[Command.SHOW_FULL_TODOS](key)) {
        setShowFullTodos((prev) => !prev);
        return true;
      } else if (keyMatchers[Command.TOGGLE_MARKDOWN](key)) {
        setRenderMarkdown((prev) => {
          const newValue = !prev;
          // Force re-render of static content
          refreshStatic();
          return newValue;
        });
        return true;
      } else if (
        keyMatchers[Command.SHOW_IDE_CONTEXT_DETAIL](key) &&
        config.getIdeMode() &&
        ideContextState
      ) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handleSlashCommand('/ide status');
        return true;
      } else if (
        keyMatchers[Command.SHOW_MORE_LINES](key) &&
        !enteringConstrainHeightMode
      ) {
        setConstrainHeight(false);
        toggleLastTurnTools();
        refreshStatic();
        return true;
      } else if (
        (keyMatchers[Command.FOCUS_SHELL_INPUT](key) ||
          keyMatchers[Command.UNFOCUS_BACKGROUND_SHELL_LIST](key)) &&
        (activePtyId || (isBackgroundTaskVisible && backgroundTasks.size > 0))
      ) {
        if (embeddedShellFocused) {
          const capturedTime = lastOutputTimeRef.current;
          if (tabFocusTimeoutRef.current)
            clearTimeout(tabFocusTimeoutRef.current);
          tabFocusTimeoutRef.current = setTimeout(() => {
            if (lastOutputTimeRef.current === capturedTime) {
              setEmbeddedShellFocused(false);
            } else {
              showTransientMessage({
                text: 'Use Shift+Tab to unfocus',
                type: TransientMessageType.Warning,
              });
            }
          }, 150);
          return false;
        }

        const isIdle = Date.now() - lastOutputTimeRef.current >= 100;

        if (isIdle && !activePtyId && !isBackgroundTaskVisible) {
          if (tabFocusTimeoutRef.current)
            clearTimeout(tabFocusTimeoutRef.current);
          toggleBackgroundTasks();
          setEmbeddedShellFocused(true);
          if (backgroundTasks.size > 1) setIsBackgroundTaskListOpen(true);
          return true;
        }

        setEmbeddedShellFocused(true);
        return true;
      } else if (
        keyMatchers[Command.UNFOCUS_SHELL_INPUT](key) ||
        keyMatchers[Command.UNFOCUS_BACKGROUND_SHELL](key)
      ) {
        if (embeddedShellFocused) {
          setEmbeddedShellFocused(false);
          return true;
        }
        return false;
      } else if (keyMatchers[Command.TOGGLE_BACKGROUND_SHELL](key)) {
        if (activePtyId) {
          backgroundCurrentExecution();
          // After backgrounding, we explicitly do NOT show or focus the background UI.
        } else {
          toggleBackgroundTasks();
          // Toggle focus based on intent: if we were hiding, unfocus; if showing, focus.
          if (!isBackgroundTaskVisible && backgroundTasks.size > 0) {
            setEmbeddedShellFocused(true);
            if (backgroundTasks.size > 1) {
              setIsBackgroundTaskListOpen(true);
            }
          } else {
            setEmbeddedShellFocused(false);
          }
        }
        return true;
      } else if (keyMatchers[Command.TOGGLE_BACKGROUND_SHELL_LIST](key)) {
        if (backgroundTasks.size > 0 && isBackgroundTaskVisible) {
          if (!embeddedShellFocused) {
            setEmbeddedShellFocused(true);
          }
          setIsBackgroundTaskListOpen(true);
        }
        return true;
      }
      return false;
    },
    [
      constrainHeight,
      setConstrainHeight,
      setShowErrorDetails,
      config,
      ideContextState,
      handleCtrlCPress,
      handleCtrlDPress,
      handleSlashCommand,
      cancelOngoingRequest,
      activePtyId,
      handleSuspend,
      embeddedShellFocused,
      settings.merged.general.debugKeystrokeLogging,
      refreshStatic,
      setCopyModeEnabled,
      tabFocusTimeoutRef,
      isAlternateBuffer,
      shortcutsHelpVisible,
      backgroundCurrentExecution,
      toggleBackgroundTasks,
      backgroundTasks,
      isBackgroundTaskVisible,
      setIsBackgroundTaskListOpen,
      lastOutputTimeRef,
      showTransientMessage,
      settings.merged.general.devtools,
      showErrorDetails,
      triggerExpandHint,
      keyMatchers,
      isHelpDismissKey,
      historyManager.history,
      pendingHistoryItems,
      toggleAllExpansion,
      dumpCurrentFrame,
      startRecording,
      stopRecording,
      mouseMode,
    ],
  );

  useKeypress(handleGlobalKeypress, { isActive: true, priority: true });

  useKeypress(
    (key: Key) => {
      if (
        keyMatchers[Command.SCROLL_UP](key) ||
        keyMatchers[Command.SCROLL_DOWN](key) ||
        keyMatchers[Command.PAGE_UP](key) ||
        keyMatchers[Command.PAGE_DOWN](key) ||
        keyMatchers[Command.SCROLL_HOME](key) ||
        keyMatchers[Command.SCROLL_END](key)
      ) {
        return false;
      }

      setCopyModeEnabled(false);
      if (mouseMode) {
        enableMouseEvents();
      }
      return true;
    },
    {
      isActive: copyModeEnabled,
      // We need to receive keypresses first so they do not bubble to other
      // handlers.
      priority: KeypressPriority.Critical,
    },
  );

  useEffect(() => {
    // Respect hideWindowTitle settings
    if (settings.merged.ui.hideWindowTitle) return;

    const paddedTitle = computeTerminalTitle({
      streamingState,
      thoughtSubject: thought?.subject,
      isConfirming:
        !!commandConfirmationRequest || shouldShowActionRequiredTitle,
      isSilentWorking: shouldShowSilentWorkingTitle,
      folderName: basename(config.getTargetDir()),
      showThoughts: !!settings.merged.ui.showStatusInTitle,
      useDynamicTitle: settings.merged.ui.dynamicWindowTitle,
    });

    // Only update the title if it's different from the last value we set
    if (lastTitleRef.current !== paddedTitle) {
      lastTitleRef.current = paddedTitle;
      stdout.write(`\x1b]0;${paddedTitle}\x07`);
    }
    // Note: We don't need to reset the window title on exit because Gemini CLI is already doing that elsewhere
  }, [
    streamingState,
    thought,
    commandConfirmationRequest,
    shouldShowActionRequiredTitle,
    shouldShowSilentWorkingTitle,
    settings.merged.ui.showStatusInTitle,
    settings.merged.ui.dynamicWindowTitle,
    settings.merged.ui.hideWindowTitle,
    config,
    stdout,
  ]);

  useEffect(() => {
    const handleUserFeedback = (payload: UserFeedbackPayload) => {
      let type: MessageType;
      switch (payload.severity) {
        case 'error':
          type = MessageType.ERROR;
          break;
        case 'warning':
          type = MessageType.WARNING;
          break;
        case 'info':
          type = MessageType.INFO;
          break;
        default:
          throw new Error(
            `Unexpected severity for user feedback: ${payload.severity}`,
          );
      }

      historyManager.addItem(
        {
          type,
          text: payload.message,
        },
        Date.now(),
      );

      // If there is an attached error object, log it to the debug drawer.
      if (payload.error) {
        debugLogger.warn(
          `[Feedback Details for "${payload.message}"]`,
          payload.error,
        );
      }
    };

    const handleHookSystemMessage = (payload: HookSystemMessagePayload) => {
      historyManager.addItem(
        {
          type: MessageType.INFO,
          text: payload.message,
          source: payload.hookName,
        } as HistoryItemInfo,
        Date.now(),
      );
    };

    coreEvents.on(CoreEvent.UserFeedback, handleUserFeedback);
    coreEvents.on(CoreEvent.HookSystemMessage, handleHookSystemMessage);

    // Flush any messages that happened during startup before this component
    // mounted.
    coreEvents.drainBacklogs();

    return () => {
      coreEvents.off(CoreEvent.UserFeedback, handleUserFeedback);
      coreEvents.off(CoreEvent.HookSystemMessage, handleHookSystemMessage);
    };
  }, [historyManager]);

  const nightly = props.version.includes('nightly');

  const dialogsVisible =
    shouldShowIdePrompt ||
    shouldShowIdePrompt ||
    isFolderTrustDialogOpen ||
    isPolicyUpdateDialogOpen ||
    adminSettingsChanged ||
    !!commandConfirmationRequest ||
    !!authConsentRequest ||
    !!permissionConfirmationRequest ||
    !!customDialog ||
    confirmUpdateExtensionRequests.length > 0 ||
    !!loopDetectionConfirmationRequest ||
    isThemeDialogOpen ||
    isSettingsDialogOpen ||
    isModelDialogOpen ||
    isAgentConfigDialogOpen ||
    isPermissionsDialogOpen ||
    isAuthenticating ||
    isAuthDialogOpen ||
    isEditorDialogOpen ||
    showPrivacyNotice ||
    showIdeRestartPrompt ||
    !!proQuotaRequest ||
    !!validationRequest ||
    !!overageMenuRequest ||
    !!emptyWalletRequest ||
    isSessionBrowserOpen ||
    authState === AuthState.AwaitingApiKeyInput ||
    !!newAgents;

  const hasPendingToolConfirmation = useMemo(
    () => isToolAwaitingConfirmation(pendingHistoryItems),
    [pendingHistoryItems],
  );

  const hasConfirmUpdateExtensionRequests =
    confirmUpdateExtensionRequests.length > 0;
  const hasLoopDetectionConfirmationRequest =
    !!loopDetectionConfirmationRequest;

  const hasPendingActionRequired =
    hasPendingToolConfirmation ||
    !!commandConfirmationRequest ||
    !!authConsentRequest ||
    hasConfirmUpdateExtensionRequests ||
    hasLoopDetectionConfirmationRequest ||
    !!proQuotaRequest ||
    !!validationRequest ||
    !!overageMenuRequest ||
    !!emptyWalletRequest ||
    !!customDialog;

  const loadingPhrases = settings.merged.ui.loadingPhrases;
  const showStatusTips = loadingPhrases === 'tips' || loadingPhrases === 'all';
  const showStatusWit = loadingPhrases === 'witty' || loadingPhrases === 'all';

  const showLoadingIndicator =
    (!embeddedShellFocused || isBackgroundTaskVisible) &&
    streamingState === StreamingState.Responding &&
    !hasPendingActionRequired;

  let estimatedStatusLength = 0;
  if (activeHooks.length > 0 && settings.merged.hooksConfig.notifications) {
    const hookLabel =
      activeHooks.length > 1 ? 'Executing Hooks' : 'Executing Hook';
    const hookNames = activeHooks
      .map(
        (h) =>
          h.name +
          (h.index && h.total && h.total > 1 ? ` (${h.index}/${h.total})` : ''),
      )
      .join(', ');
    estimatedStatusLength = hookLabel.length + hookNames.length + 10;
  } else if (showLoadingIndicator) {
    const thoughtText = thought?.subject || 'Waiting for model...';
    estimatedStatusLength = thoughtText.length + 25;
  } else if (hasPendingActionRequired) {
    estimatedStatusLength = 35;
  }

  const maxLength = terminalWidth - estimatedStatusLength - 5;

  const { elapsedTime, currentLoadingPhrase, currentTip, currentWittyPhrase } =
    useLoadingIndicator({
      streamingState,
      shouldShowFocusHint,
      retryStatus,
      showTips: showStatusTips,
      showWit: showStatusWit,
      customWittyPhrases: settings.merged.ui.customWittyPhrases,
      errorVerbosity: settings.merged.ui.errorVerbosity,
      maxLength,
    });

  const allowPlanMode =
    config.isPlanEnabled() &&
    streamingState === StreamingState.Idle &&
    !hasPendingActionRequired;

  const showApprovalModeIndicator = useApprovalModeIndicator({
    config,
    addItem: historyManager.addItem,
    onApprovalModeChange: handleApprovalModeChangeWithUiReveal,
    isActive: !embeddedShellFocused,
    allowPlanMode,
  });

  useRunEventNotifications({
    notificationsEnabled,
    notificationMethod,
    isFocused,
    hasReceivedFocusEvent,
    streamingState,
    hasPendingActionRequired,
    pendingHistoryItems,
    commandConfirmationRequest,
    authConsentRequest,
    permissionConfirmationRequest,
    hasConfirmUpdateExtensionRequests,
    hasLoopDetectionConfirmationRequest,
  });

  const isPassiveShortcutsHelpState =
    isInputActive &&
    streamingState === StreamingState.Idle &&
    !hasPendingActionRequired;

  useEffect(() => {
    if (shortcutsHelpVisible && !isPassiveShortcutsHelpState) {
      setShortcutsHelpVisible(false);
    }
  }, [
    shortcutsHelpVisible,
    isPassiveShortcutsHelpState,
    setShortcutsHelpVisible,
  ]);

  useEffect(() => {
    if (
      !isConfigInitialized ||
      !config.isModelSteeringEnabled() ||
      streamingState !== StreamingState.Idle ||
      !isMcpReady ||
      isToolAwaitingConfirmation(pendingHistoryItems)
    ) {
      return;
    }

    const pendingHint = consumePendingHints();
    if (!pendingHint) {
      return;
    }

    void submitQuery([{ text: buildUserSteeringHintPrompt(pendingHint) }]);
  }, [
    config,
    historyManager,
    isConfigInitialized,
    isMcpReady,
    streamingState,
    submitQuery,
    consumePendingHints,
    pendingHistoryItems,
    pendingHintCount,
  ]);

  const allToolCalls = useMemo(
    () => getAllToolCalls(pendingHistoryItems),
    [pendingHistoryItems],
  );

  const [geminiMdFileCount, setGeminiMdFileCount] = useState<number>(
    config.getGeminiMdFileCount(),
  );
  useEffect(() => {
    const handleMemoryChanged = (result: MemoryChangedPayload) => {
      setGeminiMdFileCount(result.fileCount);
    };
    coreEvents.on(CoreEvent.MemoryChanged, handleMemoryChanged);
    return () => {
      coreEvents.off(CoreEvent.MemoryChanged, handleMemoryChanged);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchBannerTexts = async () => {
      const [defaultBanner, warningBanner] = await Promise.all([
        config.getBannerTextNoCapacityIssues(),
        config.getBannerTextCapacityIssues(),
      ]);

      if (isMounted) {
        setDefaultBannerText(defaultBanner);
        setWarningBannerText(warningBanner);
        setBannerVisible(true);
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchBannerTexts();

    return () => {
      isMounted = false;
    };
  }, [config, refreshStatic]);

  const inputState = useMemo(
    () => ({
      buffer,
      userMessages: inputHistory,
      shellModeActive,
      showEscapePrompt,
      copyModeEnabled,
      inputWidth,
      suggestionsWidth,
    }),
    [
      buffer,
      inputHistory,
      shellModeActive,
      showEscapePrompt,
      copyModeEnabled,
      inputWidth,
      suggestionsWidth,
    ],
  );

  const quotaState = useMemo(
    () => ({
      userTier,
      stats: quotaStats,
      proQuotaRequest,
      validationRequest,
      // G1 AI Credits dialog state
      overageMenuRequest,
      emptyWalletRequest,
    }),
    [
      userTier,
      quotaStats,
      proQuotaRequest,
      validationRequest,
      overageMenuRequest,
      emptyWalletRequest,
    ],
  );

  const uiState: UIState = useMemo(
    () => ({
      history: historyManager.history,
      historyManager,
      isThemeDialogOpen,

      themeError,
      isAuthenticating,
      isConfigInitialized,
      authError,
      accountSuspensionInfo,
      isAuthDialogOpen,
      isAwaitingApiKeyInput: authState === AuthState.AwaitingApiKeyInput,
      apiKeyDefaultValue,
      editorError,
      isEditorDialogOpen,
      showPrivacyNotice,
      mouseMode,
      corgiMode,
      debugMessage,
      quittingMessages,
      isSettingsDialogOpen,
      isSessionBrowserOpen,
      isModelDialogOpen,
      isAgentConfigDialogOpen,
      selectedAgentName,
      selectedAgentDisplayName,
      selectedAgentDefinition,
      isPermissionsDialogOpen,
      permissionsDialogProps,
      slashCommands,
      pendingSlashCommandHistoryItems,
      commandContext,
      commandConfirmationRequest,
      authConsentRequest,
      confirmUpdateExtensionRequests,
      loopDetectionConfirmationRequest,
      permissionConfirmationRequest,
      geminiMdFileCount,
      streamingState,
      initError,
      pendingGeminiHistoryItems,
      thought,
      isInputActive,
      isResuming,
      shouldShowIdePrompt,
      isFolderTrustDialogOpen: isFolderTrustDialogOpen ?? false,
      folderDiscoveryResults,
      isPolicyUpdateDialogOpen,
      policyUpdateConfirmationRequest,
      isTrustedFolder,
      constrainHeight,
      showErrorDetails,
      showFullTodos,
      ideContextState,
      renderMarkdown,
      ctrlCPressedOnce: ctrlCPressCount >= 1,
      ctrlDPressedOnce: ctrlDPressCount >= 1,
      shortcutsHelpVisible,
      cleanUiDetailsVisible,
      isFocused,
      elapsedTime,
      currentLoadingPhrase,
      currentTip,
      currentWittyPhrase,
      historyRemountKey,
      activeHooks,
      messageQueue,
      queueErrorMessage,
      showApprovalModeIndicator,
      allowPlanMode,
      currentModel,
      contextFileNames,
      errorCount,
      availableTerminalHeight,
      stableControlsHeight,
      mainAreaWidth,
      staticAreaMaxItemHeight,
      staticExtraHeight,
      dialogsVisible,
      pendingHistoryItems,
      nightly,
      branchName,
      sessionStats,
      terminalWidth,
      terminalHeight,
      mainControlsRef,
      rootUiRef,
      currentIDE,
      updateInfo,
      showIdeRestartPrompt,
      ideTrustRestartReason,
      isRestarting,
      extensionsUpdateState,
      activePtyId,
      backgroundTaskCount,
      isBackgroundTaskVisible,
      embeddedShellFocused,
      showDebugProfiler,
      customDialog,
      transientMessage,
      bannerData,
      bannerVisible,
      terminalBackgroundColor: config.getTerminalBackground(),
      settingsNonce,
      backgroundTasks,
      activeBackgroundTaskPid,
      backgroundTaskHeight,
      isBackgroundTaskListOpen,
      adminSettingsChanged,
      newAgents,
      showIsExpandableHint,
      hintMode:
        config.isModelSteeringEnabled() && isToolExecuting(pendingHistoryItems),
      hintBuffer: '',
    }),
    [
      isThemeDialogOpen,

      themeError,
      isAuthenticating,
      isConfigInitialized,
      authError,
      accountSuspensionInfo,
      isAuthDialogOpen,
      editorError,
      isEditorDialogOpen,
      showPrivacyNotice,
      mouseMode,
      corgiMode,
      debugMessage,
      quittingMessages,
      isSettingsDialogOpen,
      isSessionBrowserOpen,
      isModelDialogOpen,
      isAgentConfigDialogOpen,
      selectedAgentName,
      selectedAgentDisplayName,
      selectedAgentDefinition,
      isPermissionsDialogOpen,
      permissionsDialogProps,
      slashCommands,
      pendingSlashCommandHistoryItems,
      commandContext,
      commandConfirmationRequest,
      authConsentRequest,
      confirmUpdateExtensionRequests,
      loopDetectionConfirmationRequest,
      permissionConfirmationRequest,
      geminiMdFileCount,
      streamingState,
      initError,
      pendingGeminiHistoryItems,
      thought,
      isInputActive,
      isResuming,
      shouldShowIdePrompt,
      isFolderTrustDialogOpen,
      folderDiscoveryResults,
      isPolicyUpdateDialogOpen,
      policyUpdateConfirmationRequest,
      isTrustedFolder,
      constrainHeight,
      showErrorDetails,
      showFullTodos,
      ideContextState,
      renderMarkdown,
      ctrlCPressCount,
      ctrlDPressCount,
      shortcutsHelpVisible,
      cleanUiDetailsVisible,
      isFocused,
      elapsedTime,
      currentLoadingPhrase,
      currentTip,
      currentWittyPhrase,
      historyRemountKey,
      activeHooks,
      messageQueue,
      queueErrorMessage,
      showApprovalModeIndicator,
      allowPlanMode,
      contextFileNames,
      errorCount,
      availableTerminalHeight,
      stableControlsHeight,
      mainAreaWidth,
      staticAreaMaxItemHeight,
      staticExtraHeight,
      dialogsVisible,
      pendingHistoryItems,
      nightly,
      branchName,
      sessionStats,
      terminalWidth,
      terminalHeight,
      mainControlsRef,
      rootUiRef,
      currentIDE,
      updateInfo,
      showIdeRestartPrompt,
      ideTrustRestartReason,
      isRestarting,
      currentModel,
      extensionsUpdateState,
      activePtyId,
      backgroundTaskCount,
      isBackgroundTaskVisible,
      historyManager,
      embeddedShellFocused,
      showDebugProfiler,
      customDialog,
      apiKeyDefaultValue,
      authState,
      transientMessage,
      bannerData,
      bannerVisible,
      config,
      settingsNonce,
      backgroundTaskHeight,
      isBackgroundTaskListOpen,
      activeBackgroundTaskPid,
      backgroundTasks,
      adminSettingsChanged,
      newAgents,
      showIsExpandableHint,
    ],
  );

  const exitPrivacyNotice = useCallback(
    () => setShowPrivacyNotice(false),
    [setShowPrivacyNotice],
  );

  const uiActions: UIActions = useMemo(
    () => ({
      handleThemeSelect,
      closeThemeDialog,
      handleThemeHighlight,
      handleAuthSelect,
      setAuthState,
      onAuthError,
      handleEditorSelect,
      exitEditorDialog,
      exitPrivacyNotice,
      closeSettingsDialog,
      closeModelDialog,
      openAgentConfigDialog,
      closeAgentConfigDialog,
      openPermissionsDialog,
      closePermissionsDialog,
      setShellModeActive,
      vimHandleInput,
      handleIdePromptComplete,
      handleFolderTrustSelect,
      setIsPolicyUpdateDialogOpen,
      setConstrainHeight,
      onEscapePromptChange: handleEscapePromptChange,
      refreshStatic,
      handleFinalSubmit,
      handleClearScreen,
      handleProQuotaChoice,
      handleValidationChoice,
      // G1 AI Credits handlers
      handleOverageMenuChoice,
      handleEmptyWalletChoice,
      openSessionBrowser,
      closeSessionBrowser,
      handleResumeSession,
      handleDeleteSession,
      setQueueErrorMessage,
      addMessage,
      popAllMessages,
      handleApiKeySubmit,
      handleApiKeyCancel,
      setBannerVisible,
      setShortcutsHelpVisible,
      setCleanUiDetailsVisible,
      toggleCleanUiDetailsVisible,
      revealCleanUiDetailsTemporarily,
      handleWarning,
      setEmbeddedShellFocused,
      dismissBackgroundTask,
      setActiveBackgroundTaskPid,
      setIsBackgroundTaskListOpen,
      setAuthContext,
      onHintInput: () => {},
      onHintBackspace: () => {},
      onHintClear: () => {},
      onHintSubmit: () => {},
      handleRestart: async () => {
        if (process.send) {
          const remoteSettings = config.getRemoteAdminSettings();
          if (remoteSettings) {
            process.send({
              type: 'admin-settings-update',
              settings: remoteSettings,
            });
          }
        }
        await relaunchApp();
      },
      handleNewAgentsSelect: async (choice: NewAgentsChoice) => {
        if (newAgents && choice === NewAgentsChoice.ACKNOWLEDGE) {
          const registry = config.getAgentRegistry();
          try {
            await Promise.all(
              newAgents.map((agent) => registry.acknowledgeAgent(agent)),
            );
          } catch (error) {
            debugLogger.error('Failed to acknowledge agents:', error);
            historyManager.addItem(
              {
                type: MessageType.ERROR,
                text: `Failed to acknowledge agents: ${getErrorMessage(error)}`,
              },
              Date.now(),
            );
          }
        }
        setNewAgents(null);
      },
      getPreferredEditor,
      clearAccountSuspension: () => {
        setAccountSuspensionInfo(null);
        setAuthState(AuthState.Updating);
      },
    }),
    [
      handleThemeSelect,
      closeThemeDialog,
      handleThemeHighlight,
      handleAuthSelect,
      setAuthState,
      onAuthError,
      handleEditorSelect,
      exitEditorDialog,
      exitPrivacyNotice,
      closeSettingsDialog,
      closeModelDialog,
      openAgentConfigDialog,
      closeAgentConfigDialog,
      openPermissionsDialog,
      closePermissionsDialog,
      setShellModeActive,
      vimHandleInput,
      handleIdePromptComplete,
      handleFolderTrustSelect,
      setIsPolicyUpdateDialogOpen,
      setConstrainHeight,
      handleEscapePromptChange,
      refreshStatic,
      handleFinalSubmit,
      handleClearScreen,
      handleProQuotaChoice,
      handleValidationChoice,
      handleOverageMenuChoice,
      handleEmptyWalletChoice,
      openSessionBrowser,
      closeSessionBrowser,
      handleResumeSession,
      handleDeleteSession,
      setQueueErrorMessage,
      addMessage,
      popAllMessages,
      handleApiKeySubmit,
      handleApiKeyCancel,
      setBannerVisible,
      setShortcutsHelpVisible,
      setCleanUiDetailsVisible,
      toggleCleanUiDetailsVisible,
      revealCleanUiDetailsTemporarily,
      handleWarning,
      setEmbeddedShellFocused,
      dismissBackgroundTask,
      setActiveBackgroundTaskPid,
      setIsBackgroundTaskListOpen,
      setAuthContext,
      setAccountSuspensionInfo,
      newAgents,
      config,
      historyManager,
      getPreferredEditor,
    ],
  );

  if (authState === AuthState.AwaitingGoogleLoginRestart) {
    return (
      <LoginWithGoogleRestartDialog
        onDismiss={() => {
          setAuthContext({});
          setAuthState(AuthState.Updating);
        }}
        config={config}
      />
    );
  }

  return (
    <UIStateContext.Provider value={uiState}>
      <QuotaContext.Provider value={quotaState}>
        <InputContext.Provider value={inputState}>
          <UIActionsContext.Provider value={uiActions}>
            <ConfigContext.Provider value={config}>
              <AppContext.Provider
                value={{
                  version: props.version,
                  startupWarnings: props.startupWarnings || [],
                }}
              >
                <ToolActionsProvider
                  config={config}
                  toolCalls={allToolCalls}
                  isExpanded={isExpanded}
                  toggleExpansion={toggleExpansion}
                  toggleAllExpansion={toggleAllExpansion}
                >
                  <ShellFocusContext.Provider value={isFocused}>
                    <MouseProvider mouseEventsEnabled={mouseMode}>
                      <ScrollProvider>
                        <App key={`app-${forceRerenderKey}`} />
                      </ScrollProvider>
                    </MouseProvider>
                  </ShellFocusContext.Provider>
                </ToolActionsProvider>
              </AppContext.Provider>
            </ConfigContext.Provider>
          </UIActionsContext.Provider>
        </InputContext.Provider>
      </QuotaContext.Provider>
    </UIStateContext.Provider>
  );
};
