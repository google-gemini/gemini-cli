/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';
import headers from 'eslint-plugin-headers';
import path from 'node:path';
import url from 'node:url';

// --- ESM way to get __dirname ---
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// --- ---

// Determine the monorepo root (assuming eslint.config.js is at the root)
const projectRoot = __dirname;
const currentYear = new Date().getFullYear();

const commonRestrictedSyntaxRules = [
  {
    selector: 'CallExpression[callee.name="require"]',
    message: 'Avoid using require(). Use ES6 imports instead.',
  },
  {
    selector: 'ThrowStatement > Literal:not([value=/^\\w+Error:/])',
    message:
      'Do not throw string literals or non-Error objects. Throw new Error("...") instead.',
  },
];

export default tseslint.config(
  {
    // Global ignores
    ignores: [
      'node_modules/*',
      'eslint.config.js',
      'packages/**/dist/**',
      'bundle/**',
      'package/bundle/**',
      '.integration-tests/**',
      'dist/**',
      'evals/**',
      'packages/test-utils/**',
      '.gemini/skills/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs['recommended-latest'],
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'], // Add this if you are using React 17+
  {
    // Settings for eslint-plugin-react
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    // Rules for packages/*/src (TS/TSX)
    files: ['packages/*/src/**/*.{ts,tsx}'],
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        node: true,
      },
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: projectRoot,
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      'import/no-default-export': 'warn',
      'import/no-unresolved': 'off',
      'import/no-duplicates': 'error',
      // General Best Practice Rules (subset adapted for flat config)
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      'arrow-body-style': ['error', 'as-needed'],
      curly: ['error', 'multi-line'],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as' },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        { accessibility: 'no-public' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-inferrable-types': [
        'error',
        { ignoreParameters: true, ignoreProperties: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Prevent async errors from bypassing catch handlers
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      'import/no-internal-modules': 'off',
      'import/no-relative-packages': 'error',
      'no-cond-assign': 'error',
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-restricted-syntax': ['error', ...commonRestrictedSyntaxRules],
      'no-unsafe-finally': 'error',
      'no-unused-expressions': 'off', // Disable base rule
      '@typescript-eslint/no-unused-expressions': [
        // Enable TS version
        'error',
        { allowShortCircuit: true, allowTernary: true },
      ],
      'no-var': 'error',
      'object-shorthand': 'error',
      'one-var': ['error', 'never'],
      'prefer-arrow-callback': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      radix: 'error',
      'no-console': 'error',
      'default-case': 'error',
      '@typescript-eslint/await-thenable': ['error'],
      '@typescript-eslint/no-floating-promises': ['error'],
      '@typescript-eslint/no-unnecessary-type-assertion': ['error'],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:os',
              importNames: ['homedir', 'tmpdir'],
              message:
                'Please use the helpers from @google/gemini-cli-core instead of node:os homedir()/tmpdir() to ensure strict environment isolation.',
            },
            {
              name: 'os',
              importNames: ['homedir', 'tmpdir'],
              message:
                'Please use the helpers from @google/gemini-cli-core instead of os homedir()/tmpdir() to ensure strict environment isolation.',
            },
          ],
        },
      ],
    },
  },
  {
    // API Response Optionality enforcement for Code Assist
    files: ['packages/core/src/code_assist/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...commonRestrictedSyntaxRules,
        {
          selector:
            'TSInterfaceDeclaration[id.name=/.+Response$/] TSPropertySignature:not([optional=true])',
          message:
            'All fields in API response interfaces (*Response) must be marked as optional (?) to prevent developers from accidentally assuming a field will always be present based on current backend behavior.',
        },
        {
          selector:
            'TSTypeAliasDeclaration[id.name=/.+Response$/] TSPropertySignature:not([optional=true])',
          message:
            'All fields in API response types (*Response) must be marked as optional (?) to prevent developers from accidentally assuming a field will always be present based on current backend behavior.',
        },
      ],
    },
  },
  {
    // Rules that only apply to product code
    files: ['packages/*/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
    },
  },
  {
    // Allow os.homedir() in tests and paths.ts where it is used to implement the helper
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      'packages/core/src/utils/paths.ts',
      'packages/test-utils/src/**/*.ts',
      'scripts/**/*.js',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // Prevent self-imports in packages
    files: ['packages/core/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          name: '@google/gemini-cli-core',
          message: 'Please use relative imports within the @google/gemini-cli-core package.',
        },
      ],
    },
  },
  {
    files: ['packages/cli/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          name: '@google/gemini-cli',
          message: 'Please use relative imports within the @google/gemini-cli package.',
        },
      ],
    },
  },
  {
    files: ['packages/sdk/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          name: '@google/gemini-cli-sdk',
          message: 'Please use relative imports within the @google/gemini-cli-sdk package.',
        },
      ],
    },
  },
  {
    files: ['packages/*/src/**/*.test.{ts,tsx}'],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/expect-expect': 'off',
      'vitest/no-commented-out-tests': 'off',
    },
  },
  {
    files: ['./**/*.{tsx,ts,js,cjs}'],
    plugins: {
      headers,
      import: importPlugin,
    },
    rules: {
      'headers/header-format': [
        'error',
        {
          source: 'string',
          content: [
            '@license',
            'Copyright (year) Google LLC',
            'SPDX-License-Identifier: Apache-2.0',
          ].join('\n'),
          patterns: {
            year: {
              pattern: `202[5-${currentYear.toString().slice(-1)}]`,
              defaultValue: currentYear.toString(),
            },
          },
        },
      ],
      'import/enforce-node-protocol-usage': ['error', 'always'],
    },
  },
  {
    files: ['./scripts/**/*.js', 'esbuild.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-restricted-syntax': 'off',
      'no-console': 'off',
      'no-empty': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['packages/vscode-ide-companion/esbuild.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Examples should have access to standard globals like fetch
  {
    files: ['packages/cli/src/commands/extensions/examples/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        fetch: 'readonly',
      },
    },
  },
  // extra settings for scripts that we run directly with node
  {
    files: ['packages/vscode-ide-companion/scripts/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Prettier config must be last
  prettierConfig,
  {
    // Legacy files with many @typescript-eslint/no-unnecessary-condition issues
    files: [
      'packages/a2a-server/src/agent/executor.ts',
      'packages/a2a-server/src/agent/task.ts',
      'packages/a2a-server/src/config/settings.ts',
      'packages/a2a-server/src/http/app.ts',
      'packages/cli/src/commands/extensions/configure.ts',
      'packages/cli/src/config/config.ts',
      'packages/cli/src/config/extension-manager.ts',
      'packages/cli/src/config/extensions/extensionEnablement.ts',
      'packages/cli/src/config/extensions/github.ts',
      'packages/cli/src/config/mcp/mcpServerEnablement.ts',
      'packages/cli/src/config/settings-validation.ts',
      'packages/cli/src/config/settings.ts',
      'packages/cli/src/config/trustedFolders.ts',
      'packages/cli/src/nonInteractiveCli.ts',
      'packages/cli/src/services/McpPromptLoader.ts',
      'packages/cli/src/test-utils/AppRig.tsx',
      'packages/cli/src/test-utils/mockConfig.ts',
      'packages/cli/src/test-utils/render.tsx',
      'packages/cli/src/ui/AppContainer.tsx',
      'packages/cli/src/ui/commands/agentsCommand.ts',
      'packages/cli/src/ui/commands/chatCommand.ts',
      'packages/cli/src/ui/commands/directoryCommand.tsx',
      'packages/cli/src/ui/commands/hooksCommand.ts',
      'packages/cli/src/ui/commands/mcpCommand.ts',
      'packages/cli/src/ui/commands/restoreCommand.ts',
      'packages/cli/src/ui/commands/rewindCommand.tsx',
      'packages/cli/src/ui/commands/setupGithubCommand.ts',
      'packages/cli/src/ui/commands/skillsCommand.ts',
      'packages/cli/src/ui/commands/statsCommand.ts',
      'packages/cli/src/ui/components/AskUserDialog.tsx',
      'packages/cli/src/ui/components/ColorsDisplay.tsx',
      'packages/cli/src/ui/components/Composer.tsx',
      'packages/cli/src/ui/components/ContextUsageDisplay.tsx',
      'packages/cli/src/ui/components/DetailedMessagesDisplay.tsx',
      'packages/cli/src/ui/components/DialogManager.tsx',
      'packages/cli/src/ui/components/ExitPlanModeDialog.tsx',
      'packages/cli/src/ui/components/FolderTrustDialog.tsx',
      'packages/cli/src/ui/components/HooksDialog.tsx',
      'packages/cli/src/ui/components/IdeTrustChangeDialog.tsx',
      'packages/cli/src/ui/components/ModelStatsDisplay.tsx',
      'packages/cli/src/ui/components/MultiFolderTrustDialog.tsx',
      'packages/cli/src/ui/components/Notifications.tsx',
      'packages/cli/src/ui/components/QuotaDisplay.tsx',
      'packages/cli/src/ui/components/RewindViewer.tsx',
      'packages/cli/src/ui/components/SessionBrowser.tsx',
      'packages/cli/src/ui/components/SettingsDialog.tsx',
      'packages/cli/src/ui/components/ShowMoreLines.tsx',
      'packages/cli/src/ui/components/StatsDisplay.tsx',
      'packages/cli/src/ui/components/ThemeDialog.tsx',
      'packages/cli/src/ui/components/UserIdentity.tsx',
      'packages/cli/src/ui/components/messages/SubagentProgressDisplay.tsx',
      'packages/cli/src/ui/components/messages/Todo.tsx',
      'packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx',
      'packages/cli/src/ui/components/messages/ToolGroupMessage.tsx',
      'packages/cli/src/ui/components/shared/BaseSettingsDialog.tsx',
      'packages/cli/src/ui/components/shared/EnumSelector.tsx',
      'packages/cli/src/ui/components/shared/MaxSizedBox.tsx',
      'packages/cli/src/ui/components/shared/Scrollable.tsx',
      'packages/cli/src/ui/components/shared/VirtualizedList.tsx',
      'packages/cli/src/ui/components/shared/text-buffer.ts',
      'packages/cli/src/ui/components/triage/TriageDuplicates.tsx',
      'packages/cli/src/ui/components/triage/TriageIssues.tsx',
      'packages/cli/src/ui/components/views/McpStatus.tsx',
      'packages/cli/src/ui/contexts/KeypressContext.tsx',
      'packages/cli/src/ui/contexts/ScrollProvider.tsx',
      'packages/cli/src/ui/contexts/SessionContext.tsx',
      'packages/cli/src/ui/hooks/slashCommandProcessor.ts',
      'packages/cli/src/ui/hooks/useAtCompletion.ts',
      'packages/cli/src/ui/hooks/useCommandCompletion.tsx',
      'packages/cli/src/ui/hooks/useConsoleMessages.ts',
      'packages/cli/src/ui/hooks/useExtensionUpdates.ts',
      'packages/cli/src/ui/hooks/useGeminiStream.ts',
      'packages/cli/src/ui/hooks/useIncludeDirsTrust.tsx',
      'packages/cli/src/ui/hooks/useInputHistory.ts',
      'packages/cli/src/ui/hooks/useInputHistoryStore.ts',
      'packages/cli/src/ui/hooks/usePermissionsModifyTrust.ts',
      'packages/cli/src/ui/hooks/usePromptCompletion.ts',
      'packages/cli/src/ui/hooks/useQuotaAndFallback.ts',
      'packages/cli/src/ui/hooks/useSelectionList.ts',
      'packages/cli/src/ui/hooks/useShellCompletion.ts',
      'packages/cli/src/ui/hooks/useSlashCompletion.ts',
      'packages/cli/src/ui/hooks/useThemeCommand.ts',
      'packages/cli/src/ui/hooks/useToolScheduler.ts',
      'packages/cli/src/ui/hooks/vim.ts',
      'packages/cli/src/ui/themes/theme-manager.ts',
      'packages/cli/src/ui/utils/CodeColorizer.tsx',
      'packages/cli/src/ui/utils/MarkdownDisplay.tsx',
      'packages/cli/src/ui/utils/borderStyles.ts',
      'packages/cli/src/ui/utils/clipboardUtils.ts',
      'packages/cli/src/ui/utils/highlight.ts',
      'packages/cli/src/ui/utils/inlineThinkingMode.ts',
      'packages/cli/src/ui/utils/keybindingUtils.ts',
      'packages/cli/src/ui/utils/terminalCapabilityManager.ts',
      'packages/cli/src/ui/utils/terminalSetup.ts',
      'packages/cli/src/ui/utils/terminalUtils.ts',
      'packages/cli/src/utils/activityLogger.ts',
      'packages/cli/src/utils/commentJson.ts',
      'packages/cli/src/utils/deepMerge.ts',
      'packages/cli/src/utils/devtoolsService.ts',
      'packages/cli/src/utils/envVarResolver.ts',
      'packages/cli/src/utils/sandbox.ts',
      'packages/cli/src/utils/sessionUtils.ts',
      'packages/cli/src/utils/settingsUtils.ts',
      'packages/cli/src/zed-integration/zedIntegration.ts',
      'packages/core/src/agents/a2a-client-manager.ts',
      'packages/core/src/agents/a2aUtils.ts',
      'packages/core/src/agents/acknowledgedAgents.ts',
      'packages/core/src/agents/browser/browserManager.ts',
      'packages/core/src/agents/browser/mcpToolWrapper.ts',
      'packages/core/src/agents/local-executor.ts',
      'packages/core/src/agents/local-invocation.ts',
      'packages/core/src/agents/registry.ts',
      'packages/core/src/agents/subagent-tool.ts',
      'packages/core/src/availability/modelAvailabilityService.ts',
      'packages/core/src/availability/policyHelpers.ts',
      'packages/core/src/billing/billing.ts',
      'packages/core/src/code_assist/admin/mcpUtils.ts',
      'packages/core/src/code_assist/converter.ts',
      'packages/core/src/code_assist/oauth2.ts',
      'packages/core/src/code_assist/server.ts',
      'packages/core/src/code_assist/setup.ts',
      'packages/core/src/code_assist/telemetry.ts',
      'packages/core/src/commands/memory.ts',
      'packages/core/src/config/config.ts',
      'packages/core/src/confirmation-bus/message-bus.ts',
      'packages/core/src/core/baseLlmClient.ts',
      'packages/core/src/core/contentGenerator.ts',
      'packages/core/src/core/coreToolHookTriggers.ts',
      'packages/core/src/core/fakeContentGenerator.ts',
      'packages/core/src/core/geminiChat.ts',
      'packages/core/src/core/logger.ts',
      'packages/core/src/core/loggingContentGenerator.ts',
      'packages/core/src/core/turn.ts',
      'packages/core/src/hooks/hookRegistry.ts',
      'packages/core/src/hooks/hookRunner.ts',
      'packages/core/src/hooks/trustedHooks.ts',
      'packages/core/src/hooks/types.ts',
      'packages/core/src/ide/ide-client.ts',
      'packages/core/src/ide/ide-connection-utils.ts',
      'packages/core/src/ide/process-utils.ts',
      'packages/core/src/mcp/oauth-provider.ts',
      'packages/core/src/mcp/token-storage/base-token-storage.ts',
      'packages/core/src/policy/config.ts',
      'packages/core/src/prompts/mcp-prompts.ts',
      'packages/core/src/prompts/promptProvider.ts',
      'packages/core/src/routing/strategies/classifierStrategy.ts',
      'packages/core/src/routing/strategies/defaultStrategy.ts',
      'packages/core/src/routing/strategies/fallbackStrategy.ts',
      'packages/core/src/routing/strategies/numericalClassifierStrategy.ts',
      'packages/core/src/routing/strategies/overrideStrategy.ts',
      'packages/core/src/safety/checker-runner.ts',
      'packages/core/src/safety/conseca/conseca.ts',
      'packages/core/src/safety/conseca/policy-enforcer.ts',
      'packages/core/src/safety/conseca/policy-generator.ts',
      'packages/core/src/safety/context-builder.ts',
      'packages/core/src/scheduler/confirmation.ts',
      'packages/core/src/scheduler/scheduler.ts',
      'packages/core/src/scheduler/state-manager.ts',
      'packages/core/src/scheduler/tool-executor.ts',
      'packages/core/src/services/environmentSanitization.ts',
      'packages/core/src/services/modelConfigService.ts',
      'packages/core/src/services/sessionSummaryUtils.ts',
      'packages/core/src/services/shellExecutionService.ts',
      'packages/core/src/services/toolOutputMaskingService.ts',
      'packages/core/src/skills/skillLoader.ts',
      'packages/core/src/telemetry/clearcut-logger/clearcut-logger.ts',
      'packages/core/src/telemetry/startupProfiler.ts',
      'packages/core/src/telemetry/telemetryAttributes.ts',
      'packages/core/src/telemetry/types.ts',
      'packages/core/src/telemetry/uiTelemetry.ts',
      'packages/core/src/tools/grep-utils.ts',
      'packages/core/src/tools/mcp-client.ts',
      'packages/core/src/tools/shell.ts',
      'packages/core/src/utils/bfsFileSearch.ts',
      'packages/core/src/utils/editCorrector.ts',
      'packages/core/src/utils/errors.ts',
      'packages/core/src/utils/fileDiffUtils.ts',
      'packages/core/src/utils/fileUtils.ts',
      'packages/core/src/utils/filesearch/crawler.ts',
      'packages/core/src/utils/filesearch/fileSearch.ts',
      'packages/core/src/utils/filesearch/result-cache.ts',
      'packages/core/src/utils/headless.ts',
      'packages/core/src/utils/ignoreFileParser.ts',
      'packages/core/src/utils/ignorePatterns.ts',
      'packages/core/src/utils/llm-edit-fixer.ts',
      'packages/core/src/utils/nextSpeakerChecker.ts',
      'packages/core/src/utils/partUtils.ts',
      'packages/core/src/utils/retry.ts',
      'packages/core/src/utils/safeJsonStringify.ts',
      'packages/core/src/utils/sessionUtils.ts',
      'packages/core/src/utils/shell-utils.ts',
      'packages/sdk/src/session.ts',
    ],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    // Legacy files with many @typescript-eslint/no-unnecessary-type-assertion issues
    files: ['packages/core/src/core/client.ts', 'packages/core/src/core/geminiChat.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
  // extra settings for scripts that we run directly with node
  {
    files: ['./integration-tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
