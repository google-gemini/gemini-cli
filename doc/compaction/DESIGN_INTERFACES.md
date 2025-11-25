# Deliberate Context Compaction: Interface & Data Flow Design

## Table of Contents

1. [Core Interfaces](#core-interfaces)
2. [Method Signatures](#method-signatures)
3. [Data Flow Scenarios](#data-flow-scenarios)
4. [State Management](#state-management)
5. [Error Handling](#error-handling)

---

## Core Interfaces

### 1. Compression Options & Results

```typescript
// packages/core/src/services/chatCompressionService.ts

/**
 * Options for compression operation
 */
interface CompressionOptions {
  // Existing fields
  force: boolean;
  model: string;
  config: GeminiClientConfig;
  hasFailedCompressionAttempt: boolean;

  // NEW: User's stated goal for trajectory-focused compression
  userGoal?: string;

  // NEW: Strategy for determining what to preserve
  preserveStrategy: 'percentage' | 'since-last-prompt';

  // NEW: For 'percentage' strategy, what % to keep (default 0.3)
  preserveThreshold?: number;

  // NEW: Whether this is interactive mode (affects UI)
  interactive?: boolean;
}

/**
 * Result of compression operation
 */
interface CompressResult {
  status: CompressionStatus;
  newHistory?: Content[];
  tokensBeforeCompression?: number;
  tokensAfterCompression?: number;

  // NEW: Metadata about compression
  messagesPreserved?: number;
  messagesCompressed?: number;
  discardedContextSummary?: string; // From model's XML output

  // NEW: Info about user interaction
  goalWasSelected?: boolean;
  selectionMethod?: 'manual' | 'timeout' | 'auto' | 'agent';
}

/**
 * Existing enum - no changes
 */
enum CompressionStatus {
  COMPRESSED = 'compressed',
  COMPRESSION_FAILED_INFLATED_TOKEN_COUNT = 'compression_failed_inflated_token_count',
  COMPRESSION_FAILED_TOKEN_COUNT_ERROR = 'compression_failed_token_count_error',
  NOOP = 'noop',
}
```

### 2. Goal Extraction

```typescript
// packages/core/src/core/client.ts

/**
 * Options extracted from conversation history
 */
interface GoalExtractionResult {
  success: boolean;
  goals: string[]; // 3-4 extracted goals
  durationMs: number;
  error?: Error;
}

/**
 * Options for message truncation during extraction
 */
interface TruncationOptions {
  keepStart: number; // Characters to keep from start
  keepEnd: number; // Characters to keep from end
}

/**
 * Validation result for extracted goals
 */
interface GoalValidation {
  isValid: boolean;
  reason?: string; // Why invalid
}
```

### 3. User Prompt & Selection

```typescript
// packages/cli/src/ui/components/messages/CompressionPrompt.tsx

/**
 * Props for the compression prompt component
 */
interface CompressionPromptProps {
  // Context information
  utilizationPercent: number; // 0.0 - 1.0
  currentTokens: number;
  modelMaxTokens: number;

  // Goal options (1-3 extracted + special options)
  goalOptions: string[];

  // Callback when user makes selection
  onGoalSelect: (selection: GoalSelection) => void;

  // Timeout configuration
  timeoutMs: number; // Default: 30000 (30s)

  // Safety valve mode (hides opt-out options)
  isSafetyValve: boolean;
}

/**
 * User's selection from the prompt
 */
type GoalSelection =
  | { type: 'goal'; value: string } // Selected goal 1-3 or custom
  | { type: 'auto' } // Auto-compress
  | { type: 'disable' } // Don't ask me again
  | { type: 'less-frequent' } // Check in less often
  | { type: 'timeout' }; // No response in time

/**
 * Internal prompt state
 */
interface PromptState {
  isWaiting: boolean;
  remainingSeconds: number;
  hasTimedOut: boolean;
  userResponse?: GoalSelection;
}
```

### 4. Trigger Decision

```typescript
// packages/core/src/core/client.ts

/**
 * Result of checking if compression should trigger
 */
interface TriggerDecision {
  shouldCompress: boolean;
  isSafetyValve: boolean;
  reason?: string; // Why compression triggered or didn't

  // Diagnostic info
  currentTokens: number;
  currentUtilization: number;
  messagesSinceLastCompress: number;
  timeSinceLastCompressSeconds: number;
}

/**
 * Guards that prevent too-frequent compression
 */
interface CompressionGuards {
  minMessages: number; // Default: 25
  minTimeBetweenSeconds: number; // Default: 300 (5 min)

  // Current state
  messagesSinceLastCompress: number;
  timeSinceLastCompressSeconds: number;

  // Results
  messagesGuardPassed: boolean;
  timeGuardPassed: boolean;
}
```

### 5. Configuration Settings

```typescript
// packages/cli/src/config/settingsSchema.ts

/**
 * NEW settings for deliberate compression
 */
interface CompressionSettings {
  // Strategy selection
  compressionStrategy: 'percentage' | 'since-last-prompt'; // Default: 'since-last-prompt'

  // Interactive mode
  compressionInteractive: boolean; // Default: true
  compressionPromptTimeout: number; // Default: 30, range: 10-300 seconds

  // Trigger thresholds
  compressionTriggerTokens: number; // Default: 40000, range: 10k-200k
  compressionTriggerUtilization: number; // Default: 0.50, range: 0.3-0.95

  // Anti-annoyance guards
  compressionMinMessagesSinceLastCompress: number; // Default: 25, range: 5-100
  compressionMinTimeBetweenPrompts: number; // Default: 300 (5min), range: 60-1800

  // Frequency adjustment
  compressionFrequencyMultiplier: number; // Default: 1.5, range: 1.2-3.0
}

/**
 * Config accessor interface
 */
interface GeminiClientConfig {
  // Existing methods...

  // NEW: Compression configuration accessors
  getCompressionStrategy(): 'percentage' | 'since-last-prompt';
  isCompressionInteractive(): boolean;
  getCompressionPromptTimeout(): number;
  getCompressionTriggerTokens(): number;
  getCompressionTriggerUtilization(): number;
  getCompressionMinMessages(): number;
  getCompressionMinTimeBetweenPrompts(): number;
  getCompressionFrequencyMultiplier(): number;

  // NEW: Setters for runtime adjustment
  setCompressionInteractive(enabled: boolean): void;
  setCompressionTriggerTokens(tokens: number): void;
  setCompressionMinMessages(messages: number): void;
}
```

### 6. Telemetry Events

```typescript
// packages/core/src/telemetry/loggers.ts

/**
 * Enhanced compression telemetry event
 */
interface ChatCompressionEvent {
  event: 'chat_compression';

  // Existing fields
  tokens_before: number;
  tokens_after: number;

  // NEW: Compression metadata
  preserve_strategy: 'percentage' | 'since-last-prompt';
  messages_preserved: number;
  messages_compressed: number;
  had_user_goal: boolean;
  interactive_mode: boolean;
  utilization_at_trigger: number;

  // NEW: Goal extraction tracking
  goal_selection_method?: 'manual' | 'timeout' | 'auto' | 'agent';
  goal_extraction_success?: boolean;
  goal_extraction_duration_ms?: number;
  prompt_timeout_occurred?: boolean;

  // NEW: Trigger tracking
  trigger_type?: 'absolute_tokens' | 'utilization_threshold';
  tokens_at_trigger?: number;
  messages_since_last_compress?: number;
  time_since_last_compress_seconds?: number;

  // NEW: Opt-out tracking
  user_selected_disable?: boolean;
  user_selected_less_frequent?: boolean;
  was_safety_valve?: boolean;

  // NEW: Frequency adjustment tracking
  frequency_multiplier_applied?: number;
  cumulative_frequency_reduction?: number;
  new_token_threshold?: number;
  new_message_threshold?: number;
  times_less_frequent_selected?: number;
}
```

### 7. Split Point Calculation

```typescript
// packages/core/src/services/chatCompressionService.ts

/**
 * Result of finding where to split history
 */
interface SplitPointResult {
  historyToCompress: Content[];
  historyToKeep: Content[];

  // Metadata
  splitIndex: number;
  tokensToCompress: number; // Estimated
  tokensToKeep: number; // Estimated
}

/**
 * Options for split point calculation
 */
interface SplitPointOptions {
  strategy: 'percentage' | 'since-last-prompt';
  preserveThreshold?: number; // For 'percentage' strategy
  minMessagesToCompress?: number; // Don't compress if too few
}
```

---

## Method Signatures

### GeminiClient (packages/core/src/core/client.ts)

````typescript
class GeminiClient {
  // NEW: Runtime state
  private lastCompressionTime: number = 0;
  private messagesSinceLastCompress: number = 0;
  private lessFrequentSelectionCount: number = 0;

  /**
   * Check if compression should trigger
   * Called before every message send
   */
  private shouldTriggerCompression(): TriggerDecision {
    const currentTokens = this.getCurrentTokenCount();
    const modelMaxTokens = this.getModelMaxTokens();
    const utilization = currentTokens / modelMaxTokens;

    // Check safety valve (50% utilization)
    if (utilization >= this.config.getCompressionTriggerUtilization()) {
      return {
        shouldCompress: true,
        isSafetyValve: true,
        reason: 'utilization_threshold',
        currentTokens,
        currentUtilization: utilization,
        messagesSinceLastCompress: this.messagesSinceLastCompress,
        timeSinceLastCompressSeconds:
          (Date.now() - this.lastCompressionTime) / 1000,
      };
    }

    // Check absolute token threshold
    if (currentTokens >= this.config.getCompressionTriggerTokens()) {
      // Check anti-annoyance guards
      const guards = this.checkCompressionGuards();

      if (!guards.messagesGuardPassed || !guards.timeGuardPassed) {
        return {
          shouldCompress: false,
          isSafetyValve: false,
          reason: guards.messagesGuardPassed
            ? 'time_guard_failed'
            : 'message_guard_failed',
          currentTokens,
          currentUtilization: utilization,
          messagesSinceLastCompress: this.messagesSinceLastCompress,
          timeSinceLastCompressSeconds:
            (Date.now() - this.lastCompressionTime) / 1000,
        };
      }

      return {
        shouldCompress: true,
        isSafetyValve: false,
        reason: 'absolute_tokens',
        currentTokens,
        currentUtilization: utilization,
        messagesSinceLastCompress: this.messagesSinceLastCompress,
        timeSinceLastCompressSeconds:
          (Date.now() - this.lastCompressionTime) / 1000,
      };
    }

    return {
      shouldCompress: false,
      isSafetyValve: false,
      reason: 'below_threshold',
      currentTokens,
      currentUtilization: utilization,
      messagesSinceLastCompress: this.messagesSinceLastCompress,
      timeSinceLastCompressSeconds:
        (Date.now() - this.lastCompressionTime) / 1000,
    };
  }

  /**
   * Check if anti-annoyance guards pass
   */
  private checkCompressionGuards(): CompressionGuards {
    const minMessages = this.config.getCompressionMinMessages();
    const minTimeSeconds = this.config.getCompressionMinTimeBetweenPrompts();
    const timeSinceLastSeconds = (Date.now() - this.lastCompressionTime) / 1000;

    return {
      minMessages,
      minTimeBetweenSeconds: minTimeSeconds,
      messagesSinceLastCompress: this.messagesSinceLastCompress,
      timeSinceLastCompressSeconds: timeSinceLastSeconds,
      messagesGuardPassed: this.messagesSinceLastCompress >= minMessages,
      timeGuardPassed:
        this.lastCompressionTime === 0 ||
        timeSinceLastSeconds >= minTimeSeconds,
    };
  }

  /**
   * Extract 3-4 potential goals from recent conversation
   * Uses truncation to reduce token cost
   */
  private async extractGoalOptions(
    history: Content[],
  ): Promise<GoalExtractionResult> {
    const startTime = Date.now();

    try {
      // Take last 10-15 exchanges (30 messages)
      const recentHistory = history.slice(-30);

      // Truncate assistant messages to save tokens
      const compactHistory = recentHistory.map((message) => {
        if (message.role === 'user') {
          return message; // Keep full user messages
        } else {
          return this.truncateMiddle(message, {
            keepStart: 500,
            keepEnd: 300,
          });
        }
      });

      // Call model with extraction prompt
      const prompt = this.buildGoalExtractionPrompt();
      const response = await this.chat.sendMessage([
        { role: 'user', parts: [{ text: prompt }] },
        { role: 'user', parts: [{ text: JSON.stringify(compactHistory) }] },
      ]);

      // Parse response
      const goals = this.parseGoalsFromResponse(response.text());

      // Validate goals
      const validGoals = goals.filter(
        (goal) => this.validateGoal(goal).isValid,
      );

      // Ensure we have at least some goals
      if (validGoals.length === 0) {
        return {
          success: false,
          goals: this.getFallbackGoals(),
          durationMs: Date.now() - startTime,
        };
      }

      return {
        success: true,
        goals: validGoals.slice(0, 3), // Max 3
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        goals: this.getFallbackGoals(),
        durationMs: Date.now() - startTime,
        error: error as Error,
      };
    }
  }

  /**
   * Truncate message to keep start and end only
   */
  private truncateMiddle(
    message: Content,
    options: TruncationOptions,
  ): Content {
    const text = this.extractTextFromMessage(message);

    if (text.length <= options.keepStart + options.keepEnd) {
      return message; // No truncation needed
    }

    const start = text.slice(0, options.keepStart);
    const end = text.slice(-options.keepEnd);
    const omitted = text.length - options.keepStart - options.keepEnd;
    const truncated = `${start}\n\n[... ${omitted} chars omitted ...]\n\n${end}`;

    return {
      ...message,
      parts: [{ text: truncated }],
    };
  }

  /**
   * Validate a single extracted goal
   */
  private validateGoal(goal: string): GoalValidation {
    if (goal.length < 10) {
      return { isValid: false, reason: 'too_short' };
    }
    if (goal.length > 100) {
      return { isValid: false, reason: 'too_long' };
    }
    if (goal.includes('```')) {
      return { isValid: false, reason: 'contains_code_block' };
    }
    if (goal.match(/^\d+\./)) {
      return { isValid: false, reason: 'numbered_list_artifact' };
    }
    return { isValid: true };
  }

  /**
   * Fallback goals if extraction fails
   */
  private getFallbackGoals(): string[] {
    return [
      'Continue current task',
      'Debug recent errors',
      'Implement new feature',
    ];
  }

  /**
   * Prompt user for goal selection with timeout
   * Returns the selected goal or 'auto' on timeout
   */
  private async promptUserForCurrentGoal(
    triggerDecision: TriggerDecision,
    goalOptions: string[],
  ): Promise<GoalSelection> {
    const timeoutMs = this.config.getCompressionPromptTimeout() * 1000;

    // Create promise for user input
    const userInputPromise = this.showCompressionPrompt({
      utilizationPercent: triggerDecision.currentUtilization,
      currentTokens: triggerDecision.currentTokens,
      modelMaxTokens: this.getModelMaxTokens(),
      goalOptions,
      timeoutMs,
      isSafetyValve: triggerDecision.isSafetyValve,
      onGoalSelect: (selection) => selection,
    });

    // Create promise for timeout
    const timeoutPromise = new Promise<GoalSelection>((resolve) => {
      setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);
    });

    // Race them
    const selection = await Promise.race([userInputPromise, timeoutPromise]);

    // Handle timeout
    if (selection.type === 'timeout') {
      this.showTimeoutMessage();
      return { type: 'auto' };
    }

    // Handle "Other" option (custom input)
    if (selection.type === 'goal' && selection.value === 'OTHER') {
      const customGoal = await this.promptForCustomGoal();
      if (!customGoal || customGoal.trim().length === 0) {
        return { type: 'auto' };
      }
      return { type: 'goal', value: customGoal };
    }

    return selection;
  }

  /**
   * Handle opt-out selections
   * Returns the effective goal to use for this compression
   */
  private handleOptOutSelection(selection: GoalSelection): GoalSelection {
    if (selection.type === 'disable') {
      // Disable interactive mode permanently
      this.config.setCompressionInteractive(false);
      this.showMessage(
        'Interactive compression disabled. Future compressions will be automatic.',
      );
      this.showMessage('Re-enable in settings: compressionInteractive = true');

      // Use auto for this compression
      return { type: 'auto' };
    }

    if (selection.type === 'less-frequent') {
      // Apply multiplier to thresholds
      const multiplier = this.config.getCompressionFrequencyMultiplier();
      const currentTokens = this.config.getCompressionTriggerTokens();
      const currentMessages = this.config.getCompressionMinMessages();

      const newTokens = Math.min(
        Math.round(currentTokens * multiplier),
        200000, // Cap at 200k
      );
      const newMessages = Math.min(
        Math.round(currentMessages * multiplier),
        100, // Cap at 100
      );

      this.config.setCompressionTriggerTokens(newTokens);
      this.config.setCompressionMinMessages(newMessages);

      this.lessFrequentSelectionCount++;
      const cumulativeMultiplier = Math.pow(
        multiplier,
        this.lessFrequentSelectionCount,
      );

      this.showMessage(
        `Check-ins ${multiplier}x less frequent:\n` +
          `  Tokens: ${currentTokens / 1000}k → ${newTokens / 1000}k\n` +
          `  Messages: ${currentMessages} → ${newMessages}\n` +
          `  Cumulative: ${cumulativeMultiplier.toFixed(1)}x less frequent`,
      );

      // Suggest disabling if selected many times
      if (this.lessFrequentSelectionCount >= 3) {
        this.showMessage(
          `Tip: You've selected "less frequent" ${this.lessFrequentSelectionCount} times. ` +
            `Consider "Don't ask me again" for fully autonomous compression.`,
        );
      }

      // Use auto for this compression
      return { type: 'auto' };
    }

    return selection;
  }

  /**
   * Main compression trigger
   * Modified to include interactive flow
   */
  async tryCompressChat(
    promptId: string,
    force: boolean = false,
  ): Promise<CompressResult> {
    // Check if compression should trigger
    const decision = this.shouldTriggerCompression();

    if (!decision.shouldCompress && !force) {
      return {
        status: CompressionStatus.NOOP,
        messagesPreserved: 0,
        messagesCompressed: 0,
      };
    }

    // Get chat history
    const chat = await this.chatManager.getChat(promptId);
    const history = chat.history;

    // Determine if we should do interactive prompt
    const isInteractive = this.config.isCompressionInteractive() && !force;

    let userGoal: string | undefined;
    let preserveStrategy: 'percentage' | 'since-last-prompt';
    let selectionMethod: 'manual' | 'timeout' | 'auto' | 'agent' = 'auto';
    let goalExtractionResult: GoalExtractionResult | undefined;

    if (isInteractive) {
      // Extract potential goals
      goalExtractionResult = await this.extractGoalOptions(history);

      if (goalExtractionResult.success) {
        // Prompt user for selection
        let selection = await this.promptUserForCurrentGoal(
          decision,
          goalExtractionResult.goals,
        );

        // Handle opt-outs
        selection = this.handleOptOutSelection(selection);

        // Process selection
        if (selection.type === 'goal') {
          userGoal = selection.value;
          preserveStrategy = 'since-last-prompt';
          selectionMethod = 'manual';
        } else if (selection.type === 'timeout') {
          preserveStrategy = 'percentage';
          selectionMethod = 'timeout';
        } else {
          // 'auto'
          preserveStrategy = 'percentage';
          selectionMethod = 'auto';
        }
      } else {
        // Extraction failed, fall back to auto
        preserveStrategy = 'percentage';
        selectionMethod = 'auto';
      }
    } else {
      // Non-interactive: use configured strategy
      preserveStrategy = this.config.getCompressionStrategy();
      selectionMethod = 'auto';
    }

    // Call compression service
    const result = await this.compressionService.compress({
      force,
      model: this.model,
      config: this.config,
      hasFailedCompressionAttempt: this.hasFailedCompressionAttempt,
      userGoal,
      preserveStrategy,
      preserveThreshold: preserveStrategy === 'percentage' ? 0.3 : undefined,
      interactive: isInteractive,
    });

    // Update state on success
    if (result.status === CompressionStatus.COMPRESSED) {
      this.lastCompressionTime = Date.now();
      this.messagesSinceLastCompress = 0;
      this.hasFailedCompressionAttempt = false;
    } else {
      this.hasFailedCompressionAttempt = true;
    }

    // Log telemetry
    this.telemetry.logChatCompression({
      tokens_before: result.tokensBeforeCompression || 0,
      tokens_after: result.tokensAfterCompression || 0,
      preserve_strategy: preserveStrategy,
      messages_preserved: result.messagesPreserved || 0,
      messages_compressed: result.messagesCompressed || 0,
      had_user_goal: !!userGoal,
      interactive_mode: isInteractive,
      utilization_at_trigger: decision.currentUtilization,
      goal_selection_method: selectionMethod,
      goal_extraction_success: goalExtractionResult?.success,
      goal_extraction_duration_ms: goalExtractionResult?.durationMs,
      prompt_timeout_occurred: selectionMethod === 'timeout',
      trigger_type: decision.reason as
        | 'absolute_tokens'
        | 'utilization_threshold',
      tokens_at_trigger: decision.currentTokens,
      messages_since_last_compress: decision.messagesSinceLastCompress,
      time_since_last_compress_seconds: decision.timeSinceLastCompressSeconds,
      was_safety_valve: decision.isSafetyValve,
      user_selected_disable: false, // Set in handleOptOutSelection
      user_selected_less_frequent: false, // Set in handleOptOutSelection
      frequency_multiplier_applied:
        selectionMethod === 'auto'
          ? undefined
          : this.config.getCompressionFrequencyMultiplier(),
      new_token_threshold: this.config.getCompressionTriggerTokens(),
      new_message_threshold: this.config.getCompressionMinMessages(),
      times_less_frequent_selected: this.lessFrequentSelectionCount,
    });

    return result;
  }

  /**
   * Called on each new message to track state
   */
  onNewMessage(): void {
    this.messagesSinceLastCompress++;
  }
}
````

### ChatCompressionService (packages/core/src/services/chatCompressionService.ts)

```typescript
class ChatCompressionService {
  /**
   * Main compression method
   * Enhanced with new options
   */
  async compress(
    chat: GenerativeModel | GoogleGenerativeAI,
    promptId: string,
    options: CompressionOptions,
  ): Promise<CompressResult> {
    const history = await this.getHistory(chat);

    // Find split point
    const splitResult = this.findCompressSplitPoint(history, {
      strategy: options.preserveStrategy,
      preserveThreshold: options.preserveThreshold,
      minMessagesToCompress: 5,
    });

    if (!splitResult) {
      return {
        status: CompressionStatus.NOOP,
        messagesPreserved: history.length,
        messagesCompressed: 0,
      };
    }

    // Get token counts before
    const tokensBeforeCompression = await this.countTokens(history);

    // Generate compression prompt
    const compressionPrompt = this.buildCompressionPrompt(
      splitResult.historyToCompress,
      options.userGoal,
    );

    // Call model to generate summary
    const summaryResponse = await chat.sendMessage(compressionPrompt);
    const summary = summaryResponse.text();

    // Construct new history
    const newHistory = [
      ...this.createSummaryMessages(summary),
      ...splitResult.historyToKeep,
    ];

    // Count tokens after
    const tokensAfterCompression = await this.countTokens(newHistory);

    // Validate: ensure compression actually reduced tokens
    if (tokensAfterCompression >= tokensBeforeCompression) {
      return {
        status: CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        tokensBeforeCompression,
        tokensAfterCompression,
        messagesPreserved: history.length,
        messagesCompressed: 0,
      };
    }

    // Extract discarded context summary from XML
    const discardedSummary = this.extractDiscardedContextSummary(summary);

    // Success!
    return {
      status: CompressionStatus.COMPRESSED,
      newHistory,
      tokensBeforeCompression,
      tokensAfterCompression,
      messagesPreserved: splitResult.historyToKeep.length,
      messagesCompressed: splitResult.historyToCompress.length,
      discardedContextSummary: discardedSummary,
      goalWasSelected: !!options.userGoal,
      selectionMethod: options.interactive ? 'manual' : 'auto',
    };
  }

  /**
   * Find where to split the history
   * Supports both percentage and since-last-prompt strategies
   */
  private findCompressSplitPoint(
    history: Content[],
    options: SplitPointOptions,
  ): SplitPointResult | null {
    if (history.length < 4) {
      return null; // Too short to compress
    }

    if (options.strategy === 'since-last-prompt') {
      return this.findSinceLastPromptSplit(history, options);
    } else {
      return this.findPercentageSplit(history, options);
    }
  }

  /**
   * Split at last user message
   * Everything before = compress, from there = keep
   */
  private findSinceLastPromptSplit(
    history: Content[],
    options: SplitPointOptions,
  ): SplitPointResult | null {
    // Find last user message
    let lastUserIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex <= 0) {
      return null; // No valid split point
    }

    // Check if we're compressing enough messages
    const messagesToCompress = lastUserIndex;
    if (messagesToCompress < (options.minMessagesToCompress || 5)) {
      return null; // Not worth compressing
    }

    // Split the history
    const historyToCompress = history.slice(0, lastUserIndex);
    const historyToKeep = history.slice(lastUserIndex);

    return {
      historyToCompress,
      historyToKeep,
      splitIndex: lastUserIndex,
      tokensToCompress: this.estimateTokens(historyToCompress),
      tokensToKeep: this.estimateTokens(historyToKeep),
    };
  }

  /**
   * Split to preserve specified percentage
   * Original behavior
   */
  private findPercentageSplit(
    history: Content[],
    options: SplitPointOptions,
  ): SplitPointResult | null {
    const preserveThreshold = options.preserveThreshold || 0.3;

    // Calculate total tokens (estimate via character count / 4)
    const totalChars = JSON.stringify(history).length;
    const estimatedTotalTokens = totalChars / 4;
    const tokensToPreserve = estimatedTotalTokens * preserveThreshold;

    // Find split point that preserves ~30% of tokens
    let currentChars = 0;
    let splitIndex = history.length;

    for (let i = history.length - 1; i >= 0; i--) {
      const messageChars = JSON.stringify(history[i]).length;
      currentChars += messageChars;

      if (currentChars / 4 >= tokensToPreserve) {
        // Found enough preserved tokens
        // Ensure we split at user message boundary
        if (history[i].role === 'user') {
          splitIndex = i;
          break;
        }
      }
    }

    if (splitIndex === 0 || splitIndex === history.length) {
      return null; // No valid split
    }

    const historyToCompress = history.slice(0, splitIndex);
    const historyToKeep = history.slice(splitIndex);

    return {
      historyToCompress,
      historyToKeep,
      splitIndex,
      tokensToCompress: this.estimateTokens(historyToCompress),
      tokensToKeep: this.estimateTokens(historyToKeep),
    };
  }

  /**
   * Build compression prompt with optional user goal
   */
  private buildCompressionPrompt(
    historyToCompress: Content[],
    userGoal?: string,
  ): string {
    let prompt = '';

    // Add user goal context if provided
    if (userGoal) {
      prompt += `The user has indicated they are currently working on:\n`;
      prompt += `<current_goal>\n${userGoal}\n</current_goal>\n\n`;
      prompt += `When creating your summary, prioritize information relevant to this goal.\n`;
      prompt += `De-emphasize or omit details unrelated to the current trajectory.\n\n`;
    }

    // Add base compression prompt from prompts.ts
    prompt += getChatCompressionPrompt();

    // Add the history to compress
    prompt += `\n\nHistory to compress:\n`;
    prompt += JSON.stringify(historyToCompress);

    return prompt;
  }

  /**
   * Create summary messages to insert into history
   */
  private createSummaryMessages(summary: string): Content[] {
    return [
      {
        role: 'user',
        parts: [
          {
            text: `[Previous conversation summary]\n\n${summary}`,
          },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            text: 'Got it. Thanks for the additional context!',
          },
        ],
      },
    ];
  }

  /**
   * Extract <discarded_context_summary> from XML output
   */
  private extractDiscardedContextSummary(
    xmlSummary: string,
  ): string | undefined {
    const match = xmlSummary.match(
      /<discarded_context_summary>(.*?)<\/discarded_context_summary>/s,
    );
    return match ? match[1].trim() : undefined;
  }
}
```

---

## Data Flow Scenarios

### Scenario 1: Normal Flow (User Selects Goal)

```
┌──────────────────────────────────────────────────────────────────┐
│ USER: Sends message "Can you help me add auth?"                  │
└────────────────┬─────────────────────────────────────────────────┘
                 │
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.onNewMessage()                                      │
│   this.messagesSinceLastCompress++  (now 26)                    │
└────────────────┬─────────────────────────────────────────────────┘
                 │
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.sendMessageStream()                                 │
│   → Calls shouldTriggerCompression()                            │
└────────────────┬─────────────────────────────────────────────────┘
                 │
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.shouldTriggerCompression()                          │
│   Input: (none - uses internal state)                           │
│                                                                  │
│   currentTokens = getCurrentTokenCount()  // 42,000             │
│   modelMaxTokens = getModelMaxTokens()    // 1,000,000          │
│   utilization = 42k / 1M = 0.042 (4.2%)                         │
│                                                                  │
│   Check 1: utilization >= 0.50? NO                              │
│   Check 2: currentTokens >= 40,000? YES                         │
│   Check 3: messagesSinceLastCompress >= 25? YES (26)            │
│   Check 4: timeSinceLastCompress >= 300s? YES (380s)            │
│                                                                  │
│   Output: TriggerDecision {                                     │
│     shouldCompress: true,                                        │
│     isSafetyValve: false,                                        │
│     reason: 'absolute_tokens',                                   │
│     currentTokens: 42000,                                        │
│     currentUtilization: 0.042,                                   │
│     messagesSinceLastCompress: 26,                               │
│     timeSinceLastCompressSeconds: 380                            │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ TriggerDecision
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.tryCompressChat()                                   │
│   Input: promptId, force=false                                  │
│   Local: decision (from shouldTriggerCompression)                │
│                                                                  │
│   isInteractive = config.isCompressionInteractive()  // true    │
│                                                                  │
│   → Calls extractGoalOptions(history)                           │
└────────────────┬─────────────────────────────────────────────────┘
                 │ history: Content[]
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.extractGoalOptions()                                │
│   Input: history (50 messages)                                  │
│                                                                  │
│   1. Take last 30 messages                                      │
│   2. Truncate assistant messages:                               │
│      - Keep full user messages                                  │
│      - Assistant: first 500 + last 300 chars                    │
│   3. Call model with extraction prompt                          │
│   4. Parse response:                                            │
│      "1. Implementing user authentication                       │
│       2. Adding login API endpoints                             │
│       3. Setting up JWT token validation"                       │
│   5. Validate each goal                                         │
│   6. Take first 3 valid goals                                   │
│                                                                  │
│   Output: GoalExtractionResult {                                │
│     success: true,                                               │
│     goals: [                                                     │
│       "Implementing user authentication",                        │
│       "Adding login API endpoints",                              │
│       "Setting up JWT token validation"                          │
│     ],                                                           │
│     durationMs: 1850                                             │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ GoalExtractionResult
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.tryCompressChat() [continued]                       │
│   goalExtractionResult received                                 │
│                                                                  │
│   → Calls promptUserForCurrentGoal(decision, goals)             │
└────────────────┬─────────────────────────────────────────────────┘
                 │ TriggerDecision, goals: string[]
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.promptUserForCurrentGoal()                          │
│   Input:                                                         │
│     triggerDecision: { currentUtilization: 0.042, ... }         │
│     goalOptions: ["Implementing user auth", ...]                │
│                                                                  │
│   → Calls showCompressionPrompt() [UI layer]                    │
└────────────────┬─────────────────────────────────────────────────┘
                 │ CompressionPromptProps
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ CompressionPrompt.tsx (UI Component)                             │
│   Input: CompressionPromptProps {                               │
│     utilizationPercent: 0.042,                                   │
│     currentTokens: 42000,                                        │
│     modelMaxTokens: 1000000,                                     │
│     goalOptions: [                                               │
│       "Implementing user authentication",                        │
│       "Adding login API endpoints",                              │
│       "Setting up JWT token validation"                          │
│     ],                                                           │
│     timeoutMs: 30000,                                            │
│     isSafetyValve: false,                                        │
│     onGoalSelect: callback                                       │
│   }                                                              │
│                                                                  │
│   DISPLAYS:                                                      │
│   ┌────────────────────────────────────────────────┐            │
│   │ 💭 Let me learn about what you're working on  │            │
│   │ Context: 42k tokens (4%)                       │            │
│   │                                                │            │
│   │ What are you currently working on?             │            │
│   │                                                │            │
│   │  1. Implementing user authentication           │            │
│   │  2. Adding login API endpoints                 │            │
│   │  3. Setting up JWT token validation            │            │
│   │  4. Auto-compress (default behavior)           │            │
│   │  5. Other (specify)                            │            │
│   │  6. Don't ask me again                         │            │
│   │  7. Check in less often                        │            │
│   │                                                │            │
│   │ Select [1-7] (auto in 30s): _                 │            │
│   └────────────────────────────────────────────────┘            │
│                                                                  │
│   USER TYPES: 1                                                 │
│                                                                  │
│   Output: GoalSelection {                                       │
│     type: 'goal',                                                │
│     value: 'Implementing user authentication'                   │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ GoalSelection (via callback)
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.promptUserForCurrentGoal() [continued]              │
│   selection received: { type: 'goal', value: '...' }           │
│                                                                  │
│   Output: GoalSelection {                                       │
│     type: 'goal',                                                │
│     value: 'Implementing user authentication'                   │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ GoalSelection
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.tryCompressChat() [continued]                       │
│   selection = { type: 'goal', value: '...' }                   │
│                                                                  │
│   → Calls handleOptOutSelection(selection)                      │
│     (no-op in this case, returns selection unchanged)           │
│                                                                  │
│   Process selection:                                            │
│     userGoal = 'Implementing user authentication'               │
│     preserveStrategy = 'since-last-prompt'                      │
│     selectionMethod = 'manual'                                  │
│                                                                  │
│   → Calls compressionService.compress(options)                  │
└────────────────┬─────────────────────────────────────────────────┘
                 │ CompressionOptions
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ ChatCompressionService.compress()                                │
│   Input: CompressionOptions {                                   │
│     force: false,                                                │
│     model: 'gemini-3-pro',                                       │
│     config: GeminiClientConfig,                                 │
│     hasFailedCompressionAttempt: false,                          │
│     userGoal: 'Implementing user authentication',               │
│     preserveStrategy: 'since-last-prompt',                       │
│     preserveThreshold: undefined,                                │
│     interactive: true                                            │
│   }                                                              │
│                                                                  │
│   → Calls findCompressSplitPoint(history, options)             │
└────────────────┬─────────────────────────────────────────────────┘
                 │ history: Content[], SplitPointOptions
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ ChatCompressionService.findCompressSplitPoint()                  │
│   Input:                                                         │
│     history: Content[] (50 messages)                            │
│     options: {                                                   │
│       strategy: 'since-last-prompt',                             │
│       minMessagesToCompress: 5                                   │
│     }                                                            │
│                                                                  │
│   → Calls findSinceLastPromptSplit()                            │
│                                                                  │
│   Logic:                                                         │
│     1. Find last user message: index 48 (out of 50)             │
│     2. messagesToCompress = 48                                  │
│     3. Check: 48 >= 5? YES                                      │
│     4. Split:                                                    │
│        - historyToCompress = messages[0:48]                     │
│        - historyToKeep = messages[48:50]                        │
│                                                                  │
│   Output: SplitPointResult {                                    │
│     historyToCompress: Content[] (48 messages),                 │
│     historyToKeep: Content[] (2 messages),                      │
│     splitIndex: 48,                                              │
│     tokensToCompress: 38500,                                     │
│     tokensToKeep: 3500                                           │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ SplitPointResult
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ ChatCompressionService.compress() [continued]                    │
│   splitResult received                                          │
│                                                                  │
│   tokensBeforeCompression = countTokens(history)  // 42,000     │
│                                                                  │
│   → Calls buildCompressionPrompt(historyToCompress, userGoal)  │
│                                                                  │
│   Prompt includes:                                              │
│     "<current_goal>Implementing user authentication</...>"      │
│     "When creating your summary, prioritize information..."     │
│     + base compression prompt                                   │
│     + historyToCompress (48 messages)                           │
│                                                                  │
│   → Call model to generate summary                              │
│   Model returns:                                                 │
│     <state_snapshot>                                             │
│       <current_goal>Implementing user authentication</...>      │
│       <relevant_context>User wants OAuth + JWT...</...>         │
│       <file_system_state>Created auth.ts, login.ts</...>       │
│       <next_steps>1. Add password hashing 2. ...</...>         │
│       <discarded_context_summary>                               │
│         Omitted earlier discussion about database choice        │
│       </discarded_context_summary>                              │
│     </state_snapshot>                                            │
│                                                                  │
│   → Create summary messages:                                    │
│     [                                                            │
│       { role: 'user', text: '[Summary]\n<state_snapshot>...' }, │
│       { role: 'model', text: 'Got it. Thanks!' }               │
│     ]                                                            │
│                                                                  │
│   newHistory = [...summaryMessages, ...historyToKeep]          │
│   tokensAfterCompression = countTokens(newHistory)  // 12,500   │
│                                                                  │
│   Validation: 12,500 < 42,000? YES ✓                           │
│                                                                  │
│   Output: CompressResult {                                      │
│     status: CompressionStatus.COMPRESSED,                       │
│     newHistory: Content[] (4 messages),                         │
│     tokensBeforeCompression: 42000,                              │
│     tokensAfterCompression: 12500,                               │
│     messagesPreserved: 2,                                        │
│     messagesCompressed: 48,                                      │
│     discardedContextSummary: "Omitted earlier discussion...",   │
│     goalWasSelected: true,                                       │
│     selectionMethod: 'manual'                                    │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ CompressResult
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.tryCompressChat() [continued]                       │
│   result received                                               │
│                                                                  │
│   Update state:                                                 │
│     this.lastCompressionTime = Date.now()                       │
│     this.messagesSinceLastCompress = 0                          │
│     this.hasFailedCompressionAttempt = false                    │
│                                                                  │
│   → Call telemetry.logChatCompression()                         │
└────────────────┬─────────────────────────────────────────────────┘
                 │ ChatCompressionEvent data
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ Telemetry.logChatCompression()                                   │
│   Input: ChatCompressionEvent {                                 │
│     event: 'chat_compression',                                   │
│     tokens_before: 42000,                                        │
│     tokens_after: 12500,                                         │
│     preserve_strategy: 'since-last-prompt',                      │
│     messages_preserved: 2,                                       │
│     messages_compressed: 48,                                     │
│     had_user_goal: true,                                         │
│     interactive_mode: true,                                      │
│     utilization_at_trigger: 0.042,                               │
│     goal_selection_method: 'manual',                             │
│     goal_extraction_success: true,                               │
│     goal_extraction_duration_ms: 1850,                           │
│     prompt_timeout_occurred: false,                              │
│     trigger_type: 'absolute_tokens',                             │
│     tokens_at_trigger: 42000,                                    │
│     messages_since_last_compress: 26,                            │
│     time_since_last_compress_seconds: 380,                       │
│     was_safety_valve: false,                                     │
│     ...                                                          │
│   }                                                              │
│                                                                  │
│   → Sends to analytics service                                  │
└────────────────┬─────────────────────────────────────────────────┘
                 │
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.tryCompressChat() [continued]                       │
│   → Return result to caller                                     │
└────────────────┬─────────────────────────────────────────────────┘
                 │ CompressResult
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ UI Layer: Display CompressionMessage                             │
│   Input: CompressResult                                         │
│                                                                  │
│   DISPLAYS:                                                      │
│   ┌────────────────────────────────────────────────┐            │
│   │ ✓ Chat history compressed                      │            │
│   │                                                │            │
│   │ Before: 42,000 tokens                          │            │
│   │ After:  12,500 tokens (70% reduction)          │            │
│   │ Preserved: Last 2 messages                     │            │
│   │                                                │            │
│   │ Context now optimized for:                     │            │
│   │ Implementing user authentication                │            │
│   └────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────┘

RESULT: Compression complete, user can continue conversation
        with focused context relevant to their stated goal
```

### Scenario 2: Timeout (User Doesn't Respond)

```
[Steps 1-8 identical to Scenario 1, up to showing the prompt]

┌──────────────────────────────────────────────────────────────────┐
│ CompressionPrompt.tsx (UI Component)                             │
│   Displays prompt with 30-second countdown                       │
│   User doesn't respond...                                       │
│   Timer reaches 0                                               │
│                                                                  │
│   Output: GoalSelection {                                       │
│     type: 'timeout'                                              │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ GoalSelection (timeout)
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.promptUserForCurrentGoal() [continued]              │
│   selection.type === 'timeout'                                  │
│                                                                  │
│   → Calls showTimeoutMessage()                                  │
│     Displays: "No response received, using auto-compress"       │
│                                                                  │
│   Output: GoalSelection {                                       │
│     type: 'auto'                                                 │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ GoalSelection (auto)
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.tryCompressChat() [continued]                       │
│   selection = { type: 'auto' }                                  │
│                                                                  │
│   Process selection:                                            │
│     userGoal = undefined                                        │
│     preserveStrategy = 'percentage'  // Conservative            │
│     selectionMethod = 'timeout'                                 │
│                                                                  │
│   → Calls compressionService.compress(options)                  │
└────────────────┬─────────────────────────────────────────────────┘
                 │ CompressionOptions (with percentage strategy)
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ ChatCompressionService.compress()                                │
│   options.preserveStrategy = 'percentage'                       │
│   options.userGoal = undefined                                  │
│                                                                  │
│   → Calls findCompressSplitPoint() with percentage strategy     │
│                                                                  │
│   Split result:                                                 │
│     - historyToCompress: 35 messages (70%)                      │
│     - historyToKeep: 15 messages (30%)                          │
│                                                                  │
│   → Build prompt WITHOUT user goal context                      │
│     (uses generic compression prompt)                           │
│                                                                  │
│   Model generates generic summary                               │
│                                                                  │
│   Output: CompressResult {                                      │
│     status: COMPRESSED,                                         │
│     messagesPreserved: 15,                                       │
│     messagesCompressed: 35,                                      │
│     tokensBeforeCompression: 42000,                              │
│     tokensAfterCompression: 18000,  // Less aggressive          │
│     selectionMethod: 'timeout'                                  │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ CompressResult
                 ↓
[Telemetry logs with prompt_timeout_occurred: true]
[UI shows compression result without specific goal]

RESULT: Compression completed automatically with conservative strategy
```

### Scenario 3: Opt-Out - "Don't ask me again"

```
[Steps 1-8 identical to Scenario 1]

┌──────────────────────────────────────────────────────────────────┐
│ CompressionPrompt.tsx                                            │
│   USER SELECTS: 6 (Don't ask me again)                          │
│                                                                  │
│   Output: GoalSelection {                                       │
│     type: 'disable'                                              │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ GoalSelection (disable)
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.tryCompressChat()                                   │
│   selection = { type: 'disable' }                               │
│                                                                  │
│   → Calls handleOptOutSelection(selection)                      │
└────────────────┬─────────────────────────────────────────────────┘
                 │ GoalSelection
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.handleOptOutSelection()                             │
│   Input: { type: 'disable' }                                    │
│                                                                  │
│   Actions:                                                       │
│     1. config.setCompressionInteractive(false)                  │
│        → Writes to ~/.gemini-cli/config.json:                   │
│          { "compressionInteractive": false }                    │
│                                                                  │
│     2. showMessage("Interactive compression disabled...")       │
│        DISPLAYS:                                                 │
│        ┌────────────────────────────────────────────┐           │
│        │ Interactive compression disabled            │           │
│        │ Future compressions will be automatic       │           │
│        │                                             │           │
│        │ Re-enable in settings:                      │           │
│        │ compressionInteractive = true               │           │
│        └────────────────────────────────────────────┘           │
│                                                                  │
│     3. Override selection for this compression                  │
│   Output: GoalSelection {                                       │
│     type: 'auto'                                                 │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ GoalSelection (auto)
                 ↓
[Continues with percentage strategy compression]
[Telemetry logs: user_selected_disable: true]

RESULT: Compression completes with auto strategy
        Future compressions will skip interactive prompt
```

### Scenario 4: Opt-Out - "Check in less often"

```
[Steps 1-8 identical to Scenario 1]

┌──────────────────────────────────────────────────────────────────┐
│ CompressionPrompt.tsx                                            │
│   USER SELECTS: 7 (Check in less often)                         │
│                                                                  │
│   Output: GoalSelection {                                       │
│     type: 'less-frequent'                                        │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ GoalSelection (less-frequent)
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.handleOptOutSelection()                             │
│   Input: { type: 'less-frequent' }                              │
│                                                                  │
│   Read config:                                                  │
│     multiplier = config.getCompressionFrequencyMultiplier()     │
│                = 1.5                                             │
│     currentTokens = config.getCompressionTriggerTokens()        │
│                   = 40000                                        │
│     currentMessages = config.getCompressionMinMessages()        │
│                     = 25                                         │
│                                                                  │
│   Calculate new thresholds:                                     │
│     newTokens = Math.round(40000 * 1.5) = 60000                │
│     newMessages = Math.round(25 * 1.5) = 38                    │
│                                                                  │
│   Update config:                                                │
│     config.setCompressionTriggerTokens(60000)                   │
│     config.setCompressionMinMessages(38)                        │
│     → Writes to ~/.gemini-cli/config.json:                      │
│       {                                                          │
│         "compressionTriggerTokens": 60000,                      │
│         "compressionMinMessagesSinceLastCompress": 38           │
│       }                                                          │
│                                                                  │
│   Increment counter:                                            │
│     this.lessFrequentSelectionCount++  (now 1)                 │
│                                                                  │
│   Calculate cumulative:                                         │
│     cumulativeMultiplier = 1.5^1 = 1.5                          │
│                                                                  │
│   Show feedback:                                                │
│     DISPLAYS:                                                    │
│     ┌───────────────────────────────────────────────┐           │
│     │ Check-ins 1.5x less frequent                  │           │
│     │                                               │           │
│     │ Updated thresholds:                           │           │
│     │ • Tokens: 40k → 60k (1.5x)                   │           │
│     │ • Messages: 25 → 38 (1.5x)                   │           │
│     │                                               │           │
│     │ Select again to reduce frequency further     │           │
│     └───────────────────────────────────────────────┘           │
│                                                                  │
│   Output: GoalSelection {                                       │
│     type: 'auto'                                                 │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ GoalSelection (auto)
                 ↓
[Continues with percentage strategy compression]
[Telemetry logs:
   user_selected_less_frequent: true,
   frequency_multiplier_applied: 1.5,
   cumulative_frequency_reduction: 1.5,
   new_token_threshold: 60000,
   new_message_threshold: 38,
   times_less_frequent_selected: 1
]

RESULT: Compression completes with auto strategy
        Future compressions trigger at 60k tokens / 38 messages

FUTURE: If user selects "less frequent" again:
        80k tokens (60k * 1.5) / 57 messages (38 * 1.5)
        Cumulative: 2.25x less frequent
```

### Scenario 5: Safety Valve (50% Utilization)

```
┌──────────────────────────────────────────────────────────────────┐
│ USER: Conversation has grown very large                          │
│       (User has been ignoring or declining prompts)              │
└────────────────┬─────────────────────────────────────────────────┘
                 │
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ GeminiClient.shouldTriggerCompression()                          │
│   currentTokens = 520,000                                        │
│   modelMaxTokens = 1,000,000                                     │
│   utilization = 0.52 (52%)                                       │
│                                                                  │
│   Check 1: utilization >= 0.50? YES ✓                           │
│                                                                  │
│   Output: TriggerDecision {                                     │
│     shouldCompress: true,                                        │
│     isSafetyValve: true,  ← IMPORTANT                           │
│     reason: 'utilization_threshold',                             │
│     currentUtilization: 0.52,                                    │
│     ...                                                          │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ TriggerDecision (safety valve)
                 ↓
[Goal extraction happens normally]
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ CompressionPrompt.tsx                                            │
│   Input: CompressionPromptProps {                               │
│     utilizationPercent: 0.52,                                    │
│     isSafetyValve: true,  ← IMPORTANT                           │
│     ...                                                          │
│   }                                                              │
│                                                                  │
│   DISPLAYS (note differences):                                  │
│   ┌────────────────────────────────────────────────┐            │
│   │ ⚠️  Context at 50% capacity                    │            │
│   │     Compression required                        │            │
│   │                                                │            │
│   │ Context: 520k tokens (52%)                     │            │
│   │                                                │            │
│   │ What are you currently working on?             │            │
│   │                                                │            │
│   │  1. Implementing user authentication           │            │
│   │  2. Adding login API endpoints                 │            │
│   │  3. Setting up JWT token validation            │            │
│   │  4. Auto-compress (default behavior)           │            │
│   │  5. Other (specify)                            │            │
│   │                                                │            │
│   │  [Options 6 & 7 HIDDEN - not allowed]         │            │
│   │                                                │            │
│   │ Select [1-5]: _                                │            │
│   └────────────────────────────────────────────────┘            │
│                                                                  │
│   Logic:                                                         │
│     if (isSafetyValve) {                                        │
│       // Hide "Don't ask me again" and "Check in less often"    │
│       // Must select a compression option                       │
│       // No timeout auto-select (wait for user choice)          │
│     }                                                            │
│                                                                  │
│   User must actively select 1-5                                 │
└────────────────┬─────────────────────────────────────────────────┘
                 │ GoalSelection (user's choice)
                 ↓
[Compression proceeds based on user's selection]
[Telemetry logs: was_safety_valve: true]

RESULT: Compression forced by system health requirements
        User cannot opt out, but can still guide compression
        Prevents unbounded context growth
```

### Scenario 6: Agent Mode (Non-Interactive)

```
┌──────────────────────────────────────────────────────────────────┐
│ AGENT: Running autonomous task                                   │
│        currentTask = { description: "Refactor auth module" }    │
└────────────────┬─────────────────────────────────────────────────┘
                 │
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ AgentExecutor.tryCompressChat()                                  │
│   Input: chat, promptId                                         │
│                                                                  │
│   → Calls compressionService.compress() directly                │
└────────────────┬─────────────────────────────────────────────────┘
                 │ CompressionOptions
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│ ChatCompressionService.compress()                                │
│   Input: CompressionOptions {                                   │
│     force: false,                                                │
│     userGoal: "Refactor auth module",  ← Agent's task           │
│     preserveStrategy: 'since-last-prompt',                       │
│     interactive: false,  ← Skip UI                              │
│     ...                                                          │
│   }                                                              │
│                                                                  │
│   Processing:                                                    │
│     - Uses 'since-last-prompt' strategy (aggressive)            │
│     - Includes agent's task as trajectory goal                  │
│     - No UI prompts shown                                       │
│     - Compression prompt includes:                              │
│       "<current_goal>Refactor auth module</current_goal>"       │
│                                                                  │
│   Output: CompressResult {                                      │
│     status: COMPRESSED,                                         │
│     selectionMethod: 'agent',                                   │
│     ...                                                          │
│   }                                                              │
└────────────────┬─────────────────────────────────────────────────┘
                 │ CompressResult
                 ↓
[Telemetry logs: goal_selection_method: 'agent', interactive_mode: false]
[Agent continues execution with compressed history]

RESULT: Compression completed without user interaction
        Agent's task used as compression goal
        Maintains trajectory focus automatically
```

---

## State Management

### GeminiClient Runtime State

```typescript
class GeminiClient {
  // Compression state (reset on session start)
  private lastCompressionTime: number = 0;
  private messagesSinceLastCompress: number = 0;
  private lessFrequentSelectionCount: number = 0;
  private hasFailedCompressionAttempt: boolean = false;

  // Updated on every message
  onNewMessage() {
    this.messagesSinceLastCompress++;
  }

  // Reset after successful compression
  onCompressionSuccess() {
    this.lastCompressionTime = Date.now();
    this.messagesSinceLastCompress = 0;
    this.hasFailedCompressionAttempt = false;
  }

  // Set on compression failure
  onCompressionFailure() {
    this.hasFailedCompressionAttempt = true;
  }

  // Increment when user selects "less frequent"
  onLessFrequentSelected() {
    this.lessFrequentSelectionCount++;
  }

  // Reset when user re-enables interactive mode
  onInteractiveModeEnabled() {
    if (this.config.isCompressionInteractive()) {
      this.lessFrequentSelectionCount = 0;
    }
  }
}
```

### Configuration Persistence

```typescript
// ~/.gemini-cli/config.json or .gemini/config.json

{
  // Deliberate compression settings
  "compressionStrategy": "since-last-prompt",
  "compressionInteractive": true,
  "compressionPromptTimeout": 30,
  "compressionTriggerTokens": 40000,
  "compressionTriggerUtilization": 0.50,
  "compressionMinMessagesSinceLastCompress": 25,
  "compressionMinTimeBetweenPrompts": 300,
  "compressionFrequencyMultiplier": 1.5,

  // Legacy settings (still supported)
  "model": {
    "compressionThreshold": 0.5
  }
}
```

**When settings are modified:**

1. **User edits config file** → Next session reads new values
2. **Runtime adjustment** (e.g., "less frequent"):
   ```typescript
   config.setCompressionTriggerTokens(60000);
   // → Writes to config.json immediately
   // → Takes effect for next compression check
   ```
3. **Disable interactive**:
   ```typescript
   config.setCompressionInteractive(false);
   // → Writes to config.json
   // → Future compressions skip prompt
   ```

### State Transitions

```
Session Start
│
├─> lastCompressionTime = 0
├─> messagesSinceLastCompress = 0
├─> lessFrequentSelectionCount = 0
│
↓ User sends messages...
│
├─> onNewMessage() → messagesSinceLastCompress++
│
↓ Trigger threshold reached
│
├─> shouldTriggerCompression()
│   ├─> Check guards
│   └─> Return decision
│
↓ Interactive prompt
│
├─> extractGoalOptions()
├─> promptUserForCurrentGoal()
│   ├─> User selects goal → 'manual'
│   ├─> User selects auto → 'auto'
│   ├─> User selects disable → setInteractive(false) + 'auto'
│   ├─> User selects less-frequent → adjust thresholds + 'auto'
│   └─> Timeout → 'timeout' → 'auto'
│
↓ Compression
│
├─> compress(options)
│   ├─> Success → COMPRESSED
│   │   ├─> lastCompressionTime = now
│   │   ├─> messagesSinceLastCompress = 0
│   │   └─> hasFailedCompressionAttempt = false
│   │
│   └─> Failure → FAILED
│       └─> hasFailedCompressionAttempt = true
│
↓ Continue session
│
└─> User sends more messages...
    └─> Repeat
```

---

## Error Handling

### Error Scenarios & Recovery

#### 1. Goal Extraction Timeout

```typescript
// In extractGoalOptions()
try {
  const result = await Promise.race([
    this.callModelForExtraction(),
    timeout(5000), // 5 second timeout
  ]);

  if (!result) {
    // Timeout occurred
    return {
      success: false,
      goals: this.getFallbackGoals(),
      durationMs: 5000,
      error: new Error('Extraction timeout'),
    };
  }
} catch (error) {
  // Network error or API error
  return {
    success: false,
    goals: this.getFallbackGoals(),
    durationMs: Date.now() - startTime,
    error: error as Error,
  };
}

// Flow continues with fallback goals
// User still sees interactive prompt
```

#### 2. Goal Extraction Returns Invalid Data

```typescript
// In extractGoalOptions()
const goals = this.parseGoalsFromResponse(response.text());
const validGoals = goals.filter((goal) => this.validateGoal(goal).isValid);

if (validGoals.length === 0) {
  // All goals invalid
  return {
    success: false,
    goals: this.getFallbackGoals(), // ["Continue current task", ...]
    durationMs: Date.now() - startTime,
  };
}

// Flow continues with fallback goals
```

#### 3. User Prompt Timeout

```typescript
// In promptUserForCurrentGoal()
const selection = await Promise.race([userInputPromise, timeout(30000)]);

if (selection.type === 'timeout') {
  this.showTimeoutMessage();
  // Auto-select "auto-compress"
  return { type: 'auto' };
}

// Flow continues with conservative compression
// No error - this is expected behavior
```

#### 4. Compression Increases Token Count

```typescript
// In compress()
if (tokensAfterCompression >= tokensBeforeCompression) {
  // Compression failed - return error
  return {
    status: CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
    tokensBeforeCompression,
    tokensAfterCompression,
    messagesPreserved: history.length,
    messagesCompressed: 0,
  };
}

// Back in tryCompressChat()
if (result.status !== CompressionStatus.COMPRESSED) {
  this.hasFailedCompressionAttempt = true;
  // Show error message to user
  this.showCompressionError(result.status);
  // Continue with original history
  return result;
}
```

#### 5. Model API Error During Compression

```typescript
// In compress()
try {
  const summaryResponse = await chat.sendMessage(compressionPrompt);
  const summary = summaryResponse.text();
  // ... continue
} catch (error) {
  // API error - return failure
  return {
    status: CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
    tokensBeforeCompression,
    tokensAfterCompression: 0,
    messagesPreserved: history.length,
    messagesCompressed: 0,
  };
}

// Flow continues without compression
// Original history retained
```

#### 6. "Other" Option with Empty Input

```typescript
// In promptUserForCurrentGoal()
if (selection.type === 'goal' && selection.value === 'OTHER') {
  const customGoal = await this.promptForCustomGoal();

  if (!customGoal || customGoal.trim().length === 0) {
    // User provided no input - fall back to auto
    this.showMessage('No goal provided, using auto-compress');
    return { type: 'auto' };
  }

  return { type: 'goal', value: customGoal };
}
```

#### 7. Config File Write Failure

```typescript
// In setCompressionTriggerTokens()
try {
  this.writeConfigFile({
    ...this.config,
    compressionTriggerTokens: newValue,
  });
} catch (error) {
  // Config write failed
  console.error('Failed to persist config:', error);

  // Apply in-memory for this session
  this.inMemoryConfig.compressionTriggerTokens = newValue;

  // Show warning to user
  this.showWarning(
    'Settings applied for this session only (could not save to disk)',
  );
}
```

### Error Message Display

```typescript
// packages/cli/src/ui/components/messages/CompressionMessage.tsx

interface CompressionMessageProps {
  status: CompressionStatus
  error?: Error
  tokensBeforeCompression?: number
  tokensAfterCompression?: number
}

function CompressionMessage({ status, error, ...props }: CompressionMessageProps) {
  if (status === CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT) {
    const historySize = props.tokensBeforeCompression || 0

    if (historySize < 50000) {
      return (
        <Message type="info">
          Compression was not beneficial for this history size.
          Continuing with full history.
        </Message>
      )
    } else {
      return (
        <Message type="warning">
          Chat history compression did not reduce size.
          Continuing with full history.
          Try again with /compress when more messages have been added.
        </Message>
      )
    }
  }

  if (status === CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR) {
    return (
      <Message type="error">
        Could not compress chat history due to a token counting error.
        {error && <Details>{error.message}</Details>}
      </Message>
    )
  }

  // Success case
  return <CompressedSuccessMessage {...props} />
}
```

---

_Design document v1.0 - Defines interfaces and data flow for deliberate context
compaction_
