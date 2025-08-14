/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface I18nMessages {
  commands: {
    help: string;
    version: string;
    launch: string;
    mcp: string;
  };
  options: {
    model: {
      description: string;
    };
    prompt: {
      description: string;
    };
    promptInteractive: {
      description: string;
    };
    sandbox: {
      description: string;
    };
    sandboxImage: {
      description: string;
    };
    debug: {
      description: string;
    };
    allFiles: {
      description: string;
    };
    showMemoryUsage: {
      description: string;
    };
    yolo: {
      description: string;
    };
    approvalMode: {
      description: string;
      choices: {
        default: string;
        autoEdit: string;
        yolo: string;
      };
    };
    telemetry: {
      description: string;
    };
    telemetryTarget: {
      description: string;
    };
    telemetryOtlpEndpoint: {
      description: string;
    };
    telemetryLogPrompts: {
      description: string;
    };
    telemetryOutfile: {
      description: string;
    };
    checkpointing: {
      description: string;
    };
    experimentalAcp: {
      description: string;
    };
    allowedMcpServerNames: {
      description: string;
    };
    extensions: {
      description: string;
    };
    listExtensions: {
      description: string;
    };
    proxy: {
      description: string;
    };
    includeDirectories: {
      description: string;
    };
    language: {
      description: string;
    };
  };
  usage: {
    main: string;
  };
  errors: {
    conflictingPromptOptions: string;
    conflictingYoloOptions: string;
    authFailed: string;
    networkError: string;
    unexpectedError: string;
    configLoadError: string;
    invalidLanguage: string;
    promptInteractiveNotSupported: string;
  };
  warnings: {
    deprecatedOption: string;
    invalidDnsOrder: string;
    deprecatedAllFiles: string;
    deprecatedShowMemoryUsage: string;
  };
  ui: {
    common?: {
      loading: string;
      pressEscToExit: string;
      pressEnterToChoose: string;
      yes: string;
      no: string;
    };
    status: {
      connecting: string;
      processing: string;
      loading: string;
      ready: string;
      contextLeft: string;
      noSandbox: string;
      seeDocs: string;
    };
    prompts: {
      confirmAction: string;
      continueYesNo: string;
    };
    memory: {
      refreshing: string;
      loaded: string;
    };
    privacy: {
      geminiApiNotice: {
        title: string;
        content: string;
        links: {
          geminiApi: string;
          googleAiStudio: string;
          apiTerms: string;
          additionalTerms: string;
        };
        exitPrompt: string;
      };
      cloudFree?: {
        title: string;
        noticeDescription: string;
        readCarefully: string;
        dataCollection: string;
        humanReview: string;
        allowDataUse: string;
        errorLoadingSettings: string;
      };
      cloudFreeNotice: {
        title: string;
        content: string;
        exitPrompt: string;
      };
      cloudPaidNotice: {
        title: string;
        content: string;
        exitPrompt: string;
      };
    };
    footer: {
      model: string;
      directory: string;
      branch: string;
      debug: string;
      errorCount: string;
      tokens: string;
    };
    auth: {
      getStarted: string;
      howToAuthenticate: string;
      loginWithGoogle: string;
      useGeminiApiKey: string;
      vertexAi: string;
      useCloudShell: string;
      useEnterToSelect: string;
      termsOfService: string;
      authenticationTimeout: string;
      waitingForAuth: string;
      inProgress: string;
      selectMethod: string;
      authenticating: string;
      success: string;
      failed: string;
      invalidDefaultAuthType: string;
      existingApiKeyDetected: string;
      mustSelectAuthMethod: string;
    };
    tips: {
      gettingStarted: string;
      askQuestions: string;
      beSpecific: string;
      helpCommand: string;
      createFiles: string;
      filesForContext: string;
    };
    shell: {
      confirmExecution: string;
      command: string;
      approve: string;
      deny: string;
    };
    session: {
      goodbye: string;
      performance: string;
      wallTime: string;
      agentActive: string;
      apiTime: string;
      toolTime: string;
    };
  };
  startup: {
    memoryArgs: string;
    relaunching: string;
    sandboxMode: string;
    debugMode: string;
  };
}

export type I18nKey = keyof I18nMessages;
export type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type I18nTranslationKey = NestedKeyOf<I18nMessages>;
