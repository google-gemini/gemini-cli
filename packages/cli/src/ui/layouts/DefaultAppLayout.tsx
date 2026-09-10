/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useUIState } from '../contexts/UIStateContext.js';
import { DialogManager } from '../components/DialogManager.js';
import { Notifications } from '../components/Notifications.js';
import { MainContent } from '../components/MainContent.js';
import { Composer } from '../components/Composer.js';
import { Footer } from '../components/Footer.js';
import { Banner } from '../components/Banner.js';

export enum ActiveModule {
  AGENT = 'agent',
  ODOO = 'odoo',
  GITHUB = 'github',
  VERCEL = 'vercel',
}

export const DefaultAppLayout = () => {
  const uiState = useUIState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<ActiveModule>(ActiveModule.AGENT);

  // Keyboard shortcut (Tab / Ctrl+D / d) to toggle drawer and switch modules
  useInput((input, key) => {
    if (key.ctrl && input === 'd') {
      setDrawerOpen((prev) => !prev);
    } else if (drawerOpen) {
      if (input === '1') {
        setActiveModule(ActiveModule.AGENT);
        setDrawerOpen(false);
      } else if (input === '2') {
        setActiveModule(ActiveModule.ODOO);
        setDrawerOpen(false);
      } else if (input === '3') {
        setActiveModule(ActiveModule.GITHUB);
        setDrawerOpen(false);
      } else if (input === '4') {
        setActiveModule(ActiveModule.VERCEL);
        setDrawerOpen(false);
      } else if (key.escape) {
        setDrawerOpen(false);
      }
    }
  });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {uiState.dialogsVisible && <DialogManager />}
      
      {/* Banner / Header */}
      <Banner />

      {/* Main workspace layout with Animated/Toggleable Side Navigation Drawer */}
      <Box flexDirection="row" flexGrow={1} width="100%">
        {/* Animated Side Drawer */}
        {drawerOpen && (
          <Box
            flexDirection="column"
            width={28}
            borderStyle="round"
            borderColor="cyan"
            paddingX={1}
            paddingY={0}
            marginRight={1}
          >
            <Box justifyContent="space-between" marginBottom={1}>
              <Text bold color="cyan">
                ≡ MODULES
              </Text>
              <Text dimColor>[Ctrl+D / Esc]</Text>
            </Box>

            <Box flexDirection="column" gap={0}>
              <Box
                paddingX={1}
                backgroundColor={activeModule === ActiveModule.AGENT ? 'blue' : undefined}
              >
                <Text color={activeModule === ActiveModule.AGENT ? 'white' : 'gray'}>
                  {activeModule === ActiveModule.AGENT ? '▶ ' : '  '}
                  1. Agent SDLC CLI
                </Text>
              </Box>

              <Box
                paddingX={1}
                backgroundColor={activeModule === ActiveModule.ODOO ? 'magenta' : undefined}
              >
                <Text color={activeModule === ActiveModule.ODOO ? 'white' : 'gray'}>
                  {activeModule === ActiveModule.ODOO ? '▶ ' : '  '}
                  2. Odoo & Accounting
                </Text>
              </Box>

              <Box
                paddingX={1}
                backgroundColor={activeModule === ActiveModule.GITHUB ? 'green' : undefined}
              >
                <Text color={activeModule === ActiveModule.GITHUB ? 'white' : 'gray'}>
                  {activeModule === ActiveModule.GITHUB ? '▶ ' : '  '}
                  3. GitHub Scaffolder
                </Text>
              </Box>

              <Box
                paddingX={1}
                backgroundColor={activeModule === ActiveModule.VERCEL ? 'yellow' : undefined}
              >
                <Text color={activeModule === ActiveModule.VERCEL ? 'white' : 'gray'}>
                  {activeModule === ActiveModule.VERCEL ? '▶ ' : '  '}
                  4. Vercel Hosting
                </Text>
              </Box>
            </Box>

            <Box marginTop={1} borderStyle="single" borderColor="gray" flexDirection="column">
              <Text dimColor textWrap="wrap">
                Press [1-4] to select module, [Ctrl+D] to toggle drawer
              </Text>
            </Box>
          </Box>
        )}

        {/* Content Area */}
        <Box flexDirection="column" flexGrow={1}>
          {/* Top Quick-Switcher Pill Bar */}
          <Box
            flexDirection="row"
            justifyContent="space-between"
            paddingX={1}
            borderStyle="single"
            borderColor="gray"
          >
            <Box flexDirection="row" gap={2}>
              <Text
                color={activeModule === ActiveModule.AGENT ? 'cyan' : 'gray'}
                bold={activeModule === ActiveModule.AGENT}
              >
                [1: Agent CLI]
              </Text>
              <Text
                color={activeModule === ActiveModule.ODOO ? 'magenta' : 'gray'}
                bold={activeModule === ActiveModule.ODOO}
              >
                [2: Odoo Suite]
              </Text>
              <Text
                color={activeModule === ActiveModule.GITHUB ? 'green' : 'gray'}
                bold={activeModule === ActiveModule.GITHUB}
              >
                [3: GitHub Scaffolder]
              </Text>
              <Text
                color={activeModule === ActiveModule.VERCEL ? 'yellow' : 'gray'}
                bold={activeModule === ActiveModule.VERCEL}
              >
                [4: Vercel Hosting]
              </Text>
            </Box>
            <Text dimColor>
              {drawerOpen ? '▲ Hide Drawer (Ctrl+D)' : '▼ Show Drawer (Ctrl+D)'}
            </Text>
          </Box>

          <Notifications />

          {/* Render Module Specific Views */}
          {activeModule === ActiveModule.AGENT && <MainContent />}

          {activeModule === ActiveModule.ODOO && (
            <Box flexDirection="column" padding={1} borderStyle="round" borderColor="magenta">
              <Text bold color="magenta">
                💼 Odoo Online Suite & Accounting Module
              </Text>
              <Text color="gray">
                • Models, Views, Security (ir.model.access.csv), __manifest__.py
              </Text>
              <Text color="gray">
                • Chart of Accounts, Bank Reconciliation, Asset Depreciation
              </Text>
              <Text color="gray">• External XML-RPC / JSON-RPC automation</Text>
              <Text dimColor marginTop={1}>
                Tip: Run /odoo in chat or composer to trigger automated generation.
              </Text>
            </Box>
          )}

          {activeModule === ActiveModule.GITHUB && (
            <Box flexDirection="column" padding={1} borderStyle="round" borderColor="green">
              <Text bold color="green">
                📦 GitHub App & Repository Scaffolder
              </Text>
              <Text color="gray">• Fullstack project architecture & package.json</Text>
              <Text color="gray">• Dockerfile & GitHub Actions CI/CD workflows</Text>
              <Text dimColor marginTop={1}>
                Tip: Run /github in chat or composer to scaffold from a repo spec.
              </Text>
            </Box>
          )}

          {activeModule === ActiveModule.VERCEL && (
            <Box flexDirection="column" padding={1} borderStyle="round" borderColor="yellow">
              <Text bold color="yellow">
                ▲ Vercel Public Domain & Hosting
              </Text>
              <Text color="gray">• vercel.json serverless routing & headers</Text>
              <Text color="gray">• Apex A Record: 76.76.21.21 | CNAME: cname.vercel-dns.com</Text>
              <Text color="gray">• Zero-downtime deployment: vercel --prod</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Composer Input Area */}
      <Composer />

      {/* Footer */}
      <Footer />
    </Box>
  );
};
