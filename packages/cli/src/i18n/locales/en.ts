/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { I18nMessages } from '../types.js';

export const enMessages: I18nMessages = {
  commands: {
    help: 'Show help',
    version: 'Show version number',
    launch: 'Launch Gemini CLI',
    mcp: 'Model Context Protocol commands',
  },
  options: {
    model: {
      description: 'Model',
    },
    prompt: {
      description: 'Prompt. Appended to input on stdin (if any).',
    },
    promptInteractive: {
      description: 'Execute the provided prompt and continue in interactive mode',
    },
    sandbox: {
      description: 'Run in sandbox?',
    },
    sandboxImage: {
      description: 'Sandbox image URI.',
    },
    debug: {
      description: 'Run in debug mode?',
    },
    allFiles: {
      description: 'Include ALL files in context?',
    },
    showMemoryUsage: {
      description: 'Show memory usage in status bar',
    },
    yolo: {
      description: 'Automatically accept all actions (aka YOLO mode, see https://www.youtube.com/watch?v=xvFZjo5PgG0 for more details)?',
    },
    approvalMode: {
      description: 'Set the approval mode: default (prompt for approval), auto_edit (auto-approve edit tools), yolo (auto-approve all tools)',
      choices: {
        default: 'prompt for approval',
        autoEdit: 'auto-approve edit tools',
        yolo: 'auto-approve all tools',
      },
    },
    telemetry: {
      description: 'Enable telemetry? This flag specifically controls if telemetry is sent. Other --telemetry-* flags set specific values but do not enable telemetry on their own.',
    },
    telemetryTarget: {
      description: 'Set the telemetry target (local or gcp). Overrides settings files.',
    },
    telemetryOtlpEndpoint: {
      description: 'Set the OTLP endpoint for telemetry. Overrides environment variables and settings files.',
    },
    telemetryLogPrompts: {
      description: 'Enable or disable logging of user prompts for telemetry. Overrides settings files.',
    },
    telemetryOutfile: {
      description: 'Redirect all telemetry output to the specified file.',
    },
    checkpointing: {
      description: 'Enables checkpointing of file edits',
    },
    experimentalAcp: {
      description: 'Starts the agent in ACP mode',
    },
    allowedMcpServerNames: {
      description: 'Allowed MCP server names',
    },
    extensions: {
      description: 'A list of extensions to use. If not provided, all extensions are used.',
    },
    listExtensions: {
      description: 'List all available extensions and exit.',
    },
    proxy: {
      description: 'Proxy for gemini client, like schema://user:password@host:port',
    },
    includeDirectories: {
      description: 'Additional directories to include in the workspace (comma-separated or multiple --include-directories)',
    },
    language: {
      description: 'Set interface language',
    },
  },
  usage: {
    main: 'Usage: gemini [options] [command]\n\nGemini CLI - Launch an interactive CLI, use -p/--prompt for non-interactive mode',
  },
  errors: {
    conflictingPromptOptions: 'Cannot use both --prompt (-p) and --prompt-interactive (-i) together',
    conflictingYoloOptions: 'Cannot use both --yolo (-y) and --approval-mode together. Use --approval-mode=yolo instead.',
    authFailed: 'Authentication failed',
    networkError: 'Network error occurred',
    unexpectedError: 'An unexpected critical error occurred',
    configLoadError: 'Failed to load configuration',
    invalidLanguage: 'Invalid language specified',
    promptInteractiveNotSupported: 'Error: The --prompt-interactive flag is not supported when piping input from stdin.',
  },
  warnings: {
    deprecatedOption: 'is deprecated',
    invalidDnsOrder: 'Invalid value for dnsResolutionOrder in settings: "{{order}}". Using default "{{defaultValue}}".',
    deprecatedAllFiles: 'Use --all-files instead. We will be removing --all_files in the coming weeks.',
    deprecatedShowMemoryUsage: 'Use --show-memory-usage instead. We will be removing --show_memory_usage in the coming weeks.',
  },
  ui: {
    status: {
      connecting: 'Connecting...',
      processing: 'Processing...',
      loading: 'Loading...',
      ready: 'Ready',
      contextLeft: 'context left',
      noSandbox: 'no sandbox',
      seeDocs: 'see /docs',
    },
    prompts: {
      confirmAction: 'Confirm this action?',
      continueYesNo: 'Continue? (Y/n)',
    },
    memory: {
      refreshing: 'Refreshing memory...',
      loaded: 'Memory loaded',
    },
    privacy: {
      geminiApiNotice: {
        title: 'Gemini API Key Notice',
        content: 'By using the Gemini API[1], Google AI Studio[2], and the other Google developer services that reference these terms (collectively, the "APIs" or "Services"), you are agreeing to Google APIs Terms of Service (the "API Terms")[3], and the Gemini API Additional Terms of Service (the "Additional Terms")[4].',
        links: {
          geminiApi: 'https://ai.google.dev/docs/gemini_api_overview',
          googleAiStudio: 'https://aistudio.google.com/',
          apiTerms: 'https://developers.google.com/terms',
          additionalTerms: 'https://ai.google.dev/gemini-api/terms',
        },
        exitPrompt: 'Press Esc to exit.',
      },
      cloudFreeNotice: {
        title: 'Cloud Free Service Notice',
        content: 'You are using the free tier of Google Cloud services.',
        exitPrompt: 'Press Esc to exit.',
      },
      cloudPaidNotice: {
        title: 'Cloud Paid Service Notice',
        content: 'You are using paid Google Cloud services.',
        exitPrompt: 'Press Esc to exit.',
      },
    },
    footer: {
      model: 'Model',
      directory: 'Directory',
      branch: 'Branch',
      debug: 'Debug',
      errorCount: 'Errors',
      tokens: 'Tokens',
    },
    auth: {
      getStarted: 'Get started',
      howToAuthenticate: 'How would you like to authenticate for this project?',
      loginWithGoogle: 'Login with Google',
      useGeminiApiKey: 'Use Gemini API Key',
      vertexAi: 'Vertex AI',
      useCloudShell: 'Use Cloud Shell user credentials',
      useEnterToSelect: '(Use Enter to select)',
      termsOfService: 'Terms of Services and Privacy Notice for Gemini CLI',
      authenticationTimeout: 'Authentication timed out. Please try again.',
      waitingForAuth: 'Waiting for auth... (Press ESC or CTRL+C to cancel)',
      inProgress: 'Authentication in progress...',
      selectMethod: 'Select authentication method',
      authenticating: 'Authenticating...',
      success: 'Authentication successful',
      failed: 'Authentication failed',
      invalidDefaultAuthType: 'Invalid value for GEMINI_DEFAULT_AUTH_TYPE: "{{value}}". Valid values are: {{validValues}}.',
      existingApiKeyDetected: 'Existing API key detected (GEMINI_API_KEY). Select "Gemini API Key" option to use it.',
      mustSelectAuthMethod: 'You must select an auth method to proceed. Press Ctrl+C twice to exit.',
    },
    tips: {
      gettingStarted: 'Tips for getting started:',
      askQuestions: '1. Ask questions, edit files, or run commands.',
      beSpecific: '2. Be specific for the best results.',
      helpCommand: '/help for more information.',
      createFiles: 'Create',
      filesForContext: 'files for better context.',
    },
    shell: {
      confirmExecution: 'Confirm shell command execution?',
      command: 'Command',
      approve: 'Approve',
      deny: 'Deny',
    },
    session: {
      goodbye: 'Agent powering down. Goodbye!',
      performance: 'Performance',
      wallTime: 'Wall Time:',
      agentActive: 'Agent Active:',
      apiTime: 'API Time:',
      toolTime: 'Tool Time:',
    },
  },
  startup: {
    memoryArgs: 'Memory arguments configured',
    relaunching: 'Relaunching with additional arguments',
    sandboxMode: 'Running in sandbox mode',
    debugMode: 'Debug mode enabled',
  },
};
